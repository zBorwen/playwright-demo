import { Hono } from 'hono';
import { zValidator } from '../middleware/zod-validator';
import { z } from 'zod';
import { db } from '../db/index';
import { projects, recordings, recordingArtifacts, executions } from '../db/schema';
import { eq, desc, and } from 'drizzle-orm';
import type { BrowserType, Recording, MockRule } from '@playwright-demo/shared';

const VALID_BROWSER_TYPES: BrowserType[] = ['chromium', 'firefox', 'webkit'];

function parseBrowserType(value?: string): BrowserType | undefined {
  if (!value) return undefined;
  if (VALID_BROWSER_TYPES.includes(value as BrowserType)) return value as BrowserType;
  return undefined;
}
import type { Env } from '../types/env';
import { getWsHandlers } from '../context';
import { generateCodegen } from '../services/codegen';
import { rm } from 'fs/promises';
import path from 'node:path';
import { successResponse, errorResponse, API_CODES } from '../middleware/response';

export const recordingsRouter = new Hono<Env>();

interface ValidRecording {
  id: string;
  title: string;
  projectId: string | null;
}

/** Load the actions artifact content for a recording, or null if none exists. */
async function loadActionsArtifact(id: string): Promise<string | null> {
  const artifact = await db
    .select()
    .from(recordingArtifacts)
    .where(and(eq(recordingArtifacts.recordingId, id), eq(recordingArtifacts.type, 'actions')))
    .orderBy(desc(recordingArtifacts.createdAt))
    .limit(1);
  return artifact.length ? artifact[0].content : null;
}

/** Load mock rules for a recording, or empty array if none exist. */
async function loadMockRules(id: string): Promise<MockRule[]> {
  const artifact = await db
    .select()
    .from(recordingArtifacts)
    .where(and(eq(recordingArtifacts.recordingId, id), eq(recordingArtifacts.type, 'mock_rules')))
    .limit(1);
  if (artifact.length && artifact[0].content) {
    return JSON.parse(artifact[0].content) as MockRule[];
  }
  return [];
}

/** Load valid recordings (have actions artifact) from a list of IDs. */
async function loadValidRecordings(ids: string[]): Promise<ValidRecording[]> {
  const valid: ValidRecording[] = [];
  for (const id of ids) {
    const rec = await db.select().from(recordings).where(eq(recordings.id, id)).limit(1);
    if (!rec.length) continue;
    const content = await loadActionsArtifact(id);
    if (content === null) continue;
    valid.push({ id, title: rec[0].title, projectId: rec[0].projectId });
  }
  return valid;
}

/** Shared batch replay execution logic used by both /batch-replay routes. */
async function executeBatchReplay(
  validRecordings: ValidRecording[],
  useMock: boolean,
  agentId: string,
  batchId: string,
  headless?: boolean,
  browserType?: BrowserType,
): Promise<{ results: Array<{ recordingId: string; executionId: string; projectId?: string }> }> {
  // Look up project-level replay speeds
  const projectIds = [...new Set(validRecordings.map(r => r.projectId).filter(Boolean))];
  const speedCache = new Map<string, string>();
  if (projectIds.length > 0) {
    const projs = await db.query.projects.findMany({
      where: (projects, { inArray }) => inArray(projects.id, projectIds as string[]),
    });
    for (const p of projs) {
      speedCache.set(p.id, p.replaySpeed || 'normal');
    }
  }

  const handlers = getWsHandlers();
  handlers.broadcastToClients(JSON.stringify({
    type: 'batch-replay:start',
    payload: { batchId, totalRecordings: validRecordings.length },
  }));

  const results: Array<{ recordingId: string; executionId: string; projectId?: string }> = [];
  for (const rec of validRecordings) {
    const content = await loadActionsArtifact(rec.id);
    if (!content) continue;

    const actionsData = JSON.parse(content);
    const mockRules = useMock ? await loadMockRules(rec.id) : [];

    const execution = await db.insert(executions).values({
      recordingId: rec.id,
      status: 'running',
    }).returning();

    handlers.broadcastToClients(JSON.stringify({
      type: 'batch-replay:result',
      payload: {
        batchId,
        recordingId: rec.id,
        recordingTitle: rec.title,
        executionId: execution[0].id,
        projectId: rec.projectId || undefined,
        status: 'running' as const,
      },
    }));

    const sent = handlers.sendToAgent(agentId, {
      type: 'replay:start',
      payload: {
        recordingId: rec.id,
        executionId: execution[0].id,
        actions: actionsData.actions || [],
        harRef: useMock ? `${rec.id}/recording.har` : '',
        mockRules,
        replaySpeed: (speedCache.get(rec.projectId || '') || 'normal') as 'fast' | 'normal' | 'slow',
        headless,
        browserType,
      },
    });

    if (sent) {
      results.push({ recordingId: rec.id, executionId: execution[0].id, projectId: rec.projectId || undefined });
    }
  }

  return { results };
}

const createRecordingSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1),
  targetUrl: z.string().url().optional(),
});

recordingsRouter.get('/', async (c) => {
  const projectId = c.req.query('projectId');
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
  // Backward compat: old artifacts stored as bare array
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
    console.error('Codegen failed:', err);
    return c.json(successResponse({ codegen: '' }));
  }
});

recordingsRouter.post('/:id/actions', zValidator('json', z.object({
  actions: z.array(z.object({ name: z.string() }).passthrough()),
})), async (c) => {
  const id = c.req.param('id');
  const { actions } = c.req.valid('json');
  const content = JSON.stringify({ recordingId: id, actions });

  // Upsert: delete only actions artifact, preserve har and mock_rules
  await db.delete(recordingArtifacts).where(and(
    eq(recordingArtifacts.recordingId, id),
    eq(recordingArtifacts.type, 'actions'),
  ));

  await db.insert(recordingArtifacts).values({
    recordingId: id,
    type: 'actions',
    content,
  });

  // Fetch recording metadata from DB for storage save
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

  // Look up recording to get project for project-level replay speed
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

  // Load mock rules if mock mode enabled
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

  // Collect all recording IDs from the specified projects
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

recordingsRouter.delete('/batch', async (c) => {
  const body = await c.req.json();
  const ids = body.ids as string[];
  if (!ids || ids.length === 0) return c.json(errorResponse(API_CODES.BAD_REQUEST, '缺少 ids'), 400);
  try {
    for (const id of ids) {
      await deleteRecording(id);
    }
    return c.json(successResponse({ deleted: ids.length }));
  } catch (e) {
    return c.json(errorResponse(API_CODES.INTERNAL_ERROR, (e as Error).message), 500);
  }
});

recordingsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await deleteRecording(id);
    return c.json(successResponse({ deleted: true }));
  } catch (e) {
    return c.json(errorResponse(API_CODES.INTERNAL_ERROR, (e as Error).message), 500);
  }
});

async function deleteRecording(id: string): Promise<void> {
  const rec = await db.select({ id: recordings.id }).from(recordings).where(eq(recordings.id, id)).limit(1);
  if (!rec.length) return;

  // Delete all artifacts and executions first
  await db.delete(recordingArtifacts).where(eq(recordingArtifacts.recordingId, id));
  await db.delete(executions).where(eq(executions.recordingId, id));
  // Delete the recording
  await db.delete(recordings).where(eq(recordings.id, id));
  // Delete storage files
  const storageDir = path.join(process.env.STORAGE_PATH || './storage', 'recordings', id);
  await rm(storageDir, { recursive: true, force: true });
}
