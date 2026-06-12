import { Hono } from 'hono';
import { zValidator } from '../middleware/zod-validator';
import { z } from 'zod';
import { db } from '../db/index';
import { projects, recordings, recordingArtifacts, executions } from '../db/schema';
import { eq, desc, and } from 'drizzle-orm';
import type { BrowserType, Recording } from '@playwright-demo/shared';
import type { Env } from '../types/env';
import { getWsHandlers } from '../context';
import { generateCodegen } from '../services/codegen';
import { successResponse, errorResponse, API_CODES } from '../middleware/response';
import { validateUuidParam } from '../middleware/uuid-validator';
import {
  loadActionsArtifact,
  loadMockRules,
  loadValidRecordings,
  executeBatchReplay,
} from '../services/batch-replay-service';
import { deleteRecording } from '../services/recording-service';

const VALID_BROWSER_TYPES: BrowserType[] = ['chromium', 'firefox', 'webkit'];

function parseBrowserType(value?: string): BrowserType | undefined {
  if (!value) return undefined;
  if (VALID_BROWSER_TYPES.includes(value as BrowserType)) return value as BrowserType;
  return undefined;
}

export const recordingsRouter = new Hono<Env>();

recordingsRouter.use('/:id*', validateUuidParam('id'));

const createRecordingSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1),
  targetUrl: z.string().url().optional(),
});

recordingsRouter.get('/', zValidator('query', z.object({ projectId: z.string().uuid().optional() })), async (c) => {
  const { projectId } = c.req.valid('query');
  const list = await db
    .select()
    .from(recordings)
    .where(projectId ? eq(recordings.projectId, projectId) : undefined)
    .orderBy(desc(recordings.createdAt));
  return c.json(successResponse(list));
});

recordingsRouter.post('/', zValidator('json', createRecordingSchema), async (c) => {
  const body = c.req.valid('json');
  const project = await db.select({ id: projects.id }).from(projects).where(eq(projects.id, body.projectId)).limit(1);
  if (!project.length) return c.json(errorResponse(API_CODES.NOT_FOUND, '项目不存在'), 404);
  const result = await db.insert(recordings).values(body).returning();
  return c.json(successResponse(result[0]), 201);
});

recordingsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const rec = await db.select().from(recordings).where(eq(recordings.id, id)).limit(1);
  if (!rec.length) return c.json(errorResponse(API_CODES.NOT_FOUND, '录制不存在'), 404);
  return c.json(successResponse(rec[0]));
});

recordingsRouter.get('/:id/actions', async (c) => {
  const id = c.req.param('id');
  const content = await loadActionsArtifact(id);
  if (content === null) return c.json(successResponse({ recordingId: id, actions: [] }));
  const parsed = JSON.parse(content);
  // 兼容旧格式：旧产物存储为裸数组
  if (Array.isArray(parsed)) {
    return c.json(successResponse({ recordingId: id, actions: parsed }));
  }
  return c.json(successResponse(parsed));
});

recordingsRouter.get('/:id/codegen', async (c) => {
  const id = c.req.param('id');
  const browserType = parseBrowserType(c.req.query('browserType'));
  const content = await loadActionsArtifact(id);
  if (content === null) return c.json(successResponse({ codegen: '' }));
  const parsed = JSON.parse(content);
  const actions = Array.isArray(parsed) ? parsed : parsed.actions ?? [];
  try {
    const code = generateCodegen(actions, { browserName: browserType });
    return c.json(successResponse({ codegen: code }));
  } catch (err) {
    console.error('Codegen 失败:', err);
    return c.json(successResponse({ codegen: '' }));
  }
});

recordingsRouter.post('/:id/actions', zValidator('json', z.object({
  actions: z.array(z.object({ name: z.string() }).passthrough()),
})), async (c) => {
  const id = c.req.param('id');
  const { actions } = c.req.valid('json');
  const content = JSON.stringify({ recordingId: id, actions });

  // Upsert：只删除 actions artifact，保留 har 和 mock_rules
  await db.delete(recordingArtifacts).where(and(
    eq(recordingArtifacts.recordingId, id),
    eq(recordingArtifacts.type, 'actions'),
  ));

  await db.insert(recordingArtifacts).values({
    recordingId: id,
    type: 'actions',
    content,
  });

  // 从 DB 读取录制元数据保存到存储
  const recording = await db.select().from(recordings).where(eq(recordings.id, id)).limit(1);
  if (recording.length) {
    const storage = c.get('storage');
    await storage.saveRecording(id, {
      recordingId: id,
      targetUrl: recording[0].targetUrl ?? '',
      title: recording[0].title,
      actions,
    } as Recording);
  }

  return c.json(successResponse({ ok: true }));
});

recordingsRouter.post('/:id/start', async (c) => {
  const id = c.req.param('id');
  const agentId = c.req.query('agentId') || 'default';
  const browserType = parseBrowserType(c.req.query('browserType'));

  const recording = await db.select().from(recordings).where(eq(recordings.id, id)).limit(1);
  if (!recording.length) return c.json(errorResponse(API_CODES.NOT_FOUND, '录制不存在'), 404);

  const handlers = getWsHandlers();
  const sent = handlers.sendToAgent(agentId, {
    type: 'record:start',
    payload: {
      targetUrl: recording[0].targetUrl || '',
      recordingId: id,
      browserType,
    },
  });

  if (!sent) return c.json(errorResponse(API_CODES.AGENT_UNAVAILABLE, 'Agent 未连接'), 503);
  return c.json(successResponse({ ok: true }));
});

recordingsRouter.post('/:id/stop', async (c) => {
  const id = c.req.param('id');
  const agentId = c.req.query('agentId') || 'default';

  const handlers = getWsHandlers();
  const sent = handlers.sendToAgent(agentId, {
    type: 'record:stop',
    payload: { recordingId: id },
  });

  if (!sent) return c.json(errorResponse(API_CODES.AGENT_UNAVAILABLE, 'Agent 未连接'), 503);
  return c.json(successResponse({ ok: true }));
});

recordingsRouter.post('/:id/replay', async (c) => {
  const id = c.req.param('id');
  const agentId = c.req.query('agentId') || 'default';
  const useMock = c.req.query('mock') === 'true';
  const querySpeed = c.req.query('replaySpeed') as 'fast' | 'normal' | 'slow' | undefined;
  const headlessParam = c.req.query('headless');
  const headless = headlessParam !== undefined ? headlessParam === 'true' : undefined;
  const browserType = parseBrowserType(c.req.query('browserType'));

  // 查找录制所属项目以获取项目级回放速度
  const rec = await db.query.recordings.findFirst({
    where: eq(recordings.id, id),
  });
  const project = rec?.projectId ? await db.query.projects.findFirst({
    where: eq(projects.id, rec.projectId),
  }) : undefined;
  const replaySpeed = querySpeed || project?.replaySpeed || 'normal';

  const content = await loadActionsArtifact(id);

  if (content === null) return c.json(errorResponse(API_CODES.NOT_FOUND, 'actions 不存在'), 404);

  const actionsData = JSON.parse(content);

  // Mock 模式下加载 mock 规则
  const mockRules = useMock ? await loadMockRules(id) : [];

  const execution = await db.insert(executions).values({
    recordingId: id,
    status: 'running',
  }).returning();

  const handlers = getWsHandlers();
  const sent = handlers.sendToAgent(agentId, {
    type: 'replay:start',
    payload: {
      recordingId: id,
      executionId: execution[0].id,
      actions: actionsData.actions || [],
      harRef: useMock ? `${id}/recording.har` : '',
      mockRules,
      replaySpeed,
      headless,
      browserType,
    },
  });

  if (!sent) return c.json(errorResponse(API_CODES.AGENT_UNAVAILABLE, 'Agent 未连接'), 503);
  return c.json(successResponse({ ok: true, executionId: execution[0].id }));
});

recordingsRouter.post('/batch-replay', zValidator('json', z.object({
  recordingIds: z.array(z.string().uuid()).min(1),
  useMock: z.boolean().optional().default(false),
  agentId: z.string().optional().default('default'),
  headless: z.boolean().optional(),
  browserType: z.string().optional(),
})), async (c) => {
  const { recordingIds, useMock, agentId, headless, browserType } = c.req.valid('json');

  const validRecordings = await loadValidRecordings(recordingIds);

  if (validRecordings.length === 0) {
    return c.json(errorResponse(API_CODES.NOT_FOUND, '没有找到有效的录制'), 404);
  }

  const batchId = crypto.randomUUID();
  const { results } = await executeBatchReplay(validRecordings, useMock, agentId, batchId, headless, parseBrowserType(browserType));

  return c.json(successResponse({
    batchId,
    total: validRecordings.length,
    results,
  }), 202);
});

recordingsRouter.post('/batch-replay/projects', zValidator('json', z.object({
  projectIds: z.array(z.string().uuid()).min(1),
  useMock: z.boolean().optional().default(false),
  agentId: z.string().optional().default('default'),
  headless: z.boolean().optional(),
  browserType: z.string().optional(),
})), async (c) => {
  const { projectIds, useMock, agentId, headless, browserType } = c.req.valid('json');

  // 收集指定项目下的所有录制 ID
  const allRecordingIds: string[] = [];
  for (const projectId of projectIds) {
    const recs = await db
      .select({ id: recordings.id })
      .from(recordings)
      .where(eq(recordings.projectId, projectId));
    allRecordingIds.push(...recs.map(r => r.id));
  }

  if (allRecordingIds.length === 0) {
    return c.json(errorResponse(API_CODES.NOT_FOUND, '这些项目下没有录制'), 404);
  }

  const validRecordings = await loadValidRecordings(allRecordingIds);

  if (validRecordings.length === 0) {
    return c.json(errorResponse(API_CODES.NOT_FOUND, '没有找到有效的录制'), 404);
  }

  const batchId = crypto.randomUUID();
  const { results } = await executeBatchReplay(validRecordings, useMock, agentId, batchId, headless, parseBrowserType(browserType));

  return c.json(successResponse({
    batchId,
    total: validRecordings.length,
    results,
  }), 202);
});

const batchDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

recordingsRouter.delete('/batch', zValidator('json', batchDeleteSchema), async (c) => {
  const { ids } = c.req.valid('json');
  try {
    for (const id of ids) {
      await deleteRecording(id);
    }
    return c.json(successResponse({ deleted: ids.length }));
  } catch (e: unknown) {
    console.error('批量删除录制失败:', e);
    return c.json(errorResponse(API_CODES.INTERNAL_ERROR, '批量删除录制失败'), 500);
  }
});

recordingsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await deleteRecording(id);
    return c.json(successResponse({ deleted: true }));
  } catch (e: unknown) {
    console.error('删除录制失败:', e);
    return c.json(errorResponse(API_CODES.INTERNAL_ERROR, '删除录制失败'), 500);
  }
});
