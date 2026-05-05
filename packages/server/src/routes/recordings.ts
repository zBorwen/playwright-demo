import { Hono } from 'hono';
import { zValidator } from '../middleware/zod-validator';
import { z } from 'zod';
import { db } from '../db/index';
import { projects, recordings, recordingArtifacts, executions } from '../db/schema';
import { eq, desc, and, inArray } from 'drizzle-orm';
import type { Recording, MockRule } from '@playwright-demo/shared';
import type { Env } from '../types/env';
import { getWsHandlers } from '../context';
import { generateCodegen } from '../services/codegen';
import { rm } from 'fs/promises';
import path from 'path';
import { successResponse, errorResponse, API_CODES } from '../middleware/response';

export const recordingsRouter = new Hono<Env>();

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
  const artifact = await db
    .select()
    .from(recordingArtifacts)
    .where(
      and(
        eq(recordingArtifacts.recordingId, id),
        eq(recordingArtifacts.type, 'actions'),
      ),
    )
    .orderBy(desc(recordingArtifacts.createdAt))
    .limit(1);
  if (!artifact.length) return c.json(successResponse({ recordingId: id, actions: [] }));
  const parsed = JSON.parse(artifact[0].content as string);
  // Backward compat: old artifacts stored as bare array
  if (Array.isArray(parsed)) {
    return c.json(successResponse({ recordingId: id, actions: parsed }));
  }
  return c.json(successResponse(parsed));
});

recordingsRouter.get('/:id/codegen', async (c) => {
  const id = c.req.param('id');
  const artifact = await db
    .select()
    .from(recordingArtifacts)
    .where(
      and(
        eq(recordingArtifacts.recordingId, id),
        eq(recordingArtifacts.type, 'actions'),
      ),
    )
    .orderBy(desc(recordingArtifacts.createdAt))
    .limit(1);
  if (!artifact.length) return c.json(successResponse({ codegen: '' }));
  const parsed = JSON.parse(artifact[0].content as string);
  const actions = Array.isArray(parsed) ? parsed : parsed.actions ?? [];
  try {
    const code = generateCodegen(actions);
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

  const recording = await db.select().from(recordings).where(eq(recordings.id, id)).limit(1);
  if (!recording.length) return c.json(errorResponse(API_CODES.NOT_FOUND, '录制不存在'), 404);

  const handlers = getWsHandlers();
  const sent = handlers.sendToAgent(agentId, {
    type: 'record:start',
    payload: {
      targetUrl: recording[0].targetUrl || '',
      recordingId: id,
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

  const artifact = await db
    .select()
    .from(recordingArtifacts)
    .where(
      and(
        eq(recordingArtifacts.recordingId, id),
        eq(recordingArtifacts.type, 'actions'),
      ),
    )
    .limit(1);

  if (!artifact.length) return c.json(errorResponse(API_CODES.NOT_FOUND, 'actions 不存在'), 404);

  const actionsData = JSON.parse(artifact[0].content as string);

  // Load mock rules if mock mode enabled
  let mockRules: MockRule[] = [];
  if (useMock) {
    const mockArtifact = await db
      .select()
      .from(recordingArtifacts)
      .where(
        and(
          eq(recordingArtifacts.recordingId, id),
          eq(recordingArtifacts.type, 'mock_rules'),
        ),
      )
      .limit(1);

    if (mockArtifact.length && mockArtifact[0].content) {
      mockRules = JSON.parse(mockArtifact[0].content) as MockRule[];
    }
  }

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
    },
  });

  if (!sent) return c.json(errorResponse(API_CODES.AGENT_UNAVAILABLE, 'Agent 未连接'), 503);
  return c.json(successResponse({ ok: true, executionId: execution[0].id }));
});

recordingsRouter.post('/batch-replay', zValidator('json', z.object({
  recordingIds: z.array(z.string().uuid()).min(1),
  useMock: z.boolean().optional().default(false),
  agentId: z.string().optional().default('default'),
})), async (c) => {
  const { recordingIds, useMock, agentId } = c.req.valid('json');

  // Validate recordings exist and have actions
  const validRecordings: Array<{ id: string; title: string }> = [];
  for (const id of recordingIds) {
    const rec = await db.select().from(recordings).where(eq(recordings.id, id)).limit(1);
    if (!rec.length) continue;
    const artifact = await db
      .select()
      .from(recordingArtifacts)
      .where(and(eq(recordingArtifacts.recordingId, id), eq(recordingArtifacts.type, 'actions')))
      .limit(1);
    if (!artifact.length) continue;
    validRecordings.push({ id, title: rec[0].title });
  }

  if (validRecordings.length === 0) {
    return c.json(errorResponse(API_CODES.NOT_FOUND, '没有找到有效的录制'), 404);
  }

  const batchId = crypto.randomUUID();
  const handlers = getWsHandlers();

  // Notify frontend about batch start
  handlers.broadcastToClients(JSON.stringify({
    type: 'batch-replay:start',
    payload: { batchId, totalRecordings: validRecordings.length },
  }));

  const results: Array<{ recordingId: string; executionId: string }> = [];
  for (const rec of validRecordings) {
    const artifact = await db
      .select()
      .from(recordingArtifacts)
      .where(and(eq(recordingArtifacts.recordingId, rec.id), eq(recordingArtifacts.type, 'actions')))
      .limit(1);

    const actionsData = JSON.parse(artifact[0].content as string);
    let mockRules: MockRule[] = [];
    if (useMock) {
      const mockArtifact = await db
        .select()
        .from(recordingArtifacts)
        .where(and(eq(recordingArtifacts.recordingId, rec.id), eq(recordingArtifacts.type, 'mock_rules')))
        .limit(1);
      if (mockArtifact.length && mockArtifact[0].content) {
        mockRules = JSON.parse(mockArtifact[0].content) as MockRule[];
      }
    }

    const execution = await db.insert(executions).values({
      recordingId: rec.id,
      status: 'running',
    }).returning();

    // Notify frontend about this recording being queued
    handlers.broadcastToClients(JSON.stringify({
      type: 'batch-replay:result',
      payload: {
        batchId,
        recordingId: rec.id,
        recordingTitle: rec.title,
        executionId: execution[0].id,
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
      },
    });

    if (sent) {
      results.push({ recordingId: rec.id, executionId: execution[0].id });
    }
  }

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
})), async (c) => {
  const { projectIds, useMock, agentId } = c.req.valid('json');

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

  const validRecordings: Array<{ id: string; title: string }> = [];
  for (const id of allRecordingIds) {
    const rec = await db.select().from(recordings).where(eq(recordings.id, id)).limit(1);
    if (!rec.length) continue;
    const artifact = await db
      .select()
      .from(recordingArtifacts)
      .where(and(eq(recordingArtifacts.recordingId, id), eq(recordingArtifacts.type, 'actions')))
      .limit(1);
    if (!artifact.length) continue;
    validRecordings.push({ id, title: rec[0].title });
  }

  if (validRecordings.length === 0) {
    return c.json(errorResponse(API_CODES.NOT_FOUND, '没有找到有效的录制'), 404);
  }

  const batchId = crypto.randomUUID();
  const handlers = getWsHandlers();

  handlers.broadcastToClients(JSON.stringify({
    type: 'batch-replay:start',
    payload: { batchId, totalRecordings: validRecordings.length },
  }));

  const results: Array<{ recordingId: string; executionId: string }> = [];
  for (const rec of validRecordings) {
    const artifact = await db
      .select()
      .from(recordingArtifacts)
      .where(and(eq(recordingArtifacts.recordingId, rec.id), eq(recordingArtifacts.type, 'actions')))
      .limit(1);

    const actionsData = JSON.parse(artifact[0].content as string);
    let mockRules: MockRule[] = [];
    if (useMock) {
      const mockArtifact = await db
        .select()
        .from(recordingArtifacts)
        .where(and(eq(recordingArtifacts.recordingId, rec.id), eq(recordingArtifacts.type, 'mock_rules')))
        .limit(1);
      if (mockArtifact.length && mockArtifact[0].content) {
        mockRules = JSON.parse(mockArtifact[0].content) as MockRule[];
      }
    }

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
      },
    });

    if (sent) {
      results.push({ recordingId: rec.id, executionId: execution[0].id });
    }
  }

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
