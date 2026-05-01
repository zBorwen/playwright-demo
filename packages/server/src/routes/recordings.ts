import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index';
import { recordings, recordingArtifacts, executions } from '../db/schema';
import { eq, desc, and, inArray } from 'drizzle-orm';
import type { Recording, MockRule } from '@playwright-demo/shared';
import type { Env } from '../types/env';
import { getWsHandlers } from '../context';
import { generateCodegen } from '../services/codegen';
import { rm } from 'fs/promises';
import path from 'path';

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
  return c.json(list);
});

recordingsRouter.post('/', zValidator('json', createRecordingSchema), async (c) => {
  const body = c.req.valid('json');
  const result = await db.insert(recordings).values(body).returning();
  return c.json(result[0], 201);
});

recordingsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const rec = await db.select().from(recordings).where(eq(recordings.id, id)).limit(1);
  if (!rec.length) return c.json({ error: 'not found' }, 404);
  return c.json(rec[0]);
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
  if (!artifact.length) return c.json({ error: 'not found' }, 404);
  const parsed = JSON.parse(artifact[0].content as string);
  // Backward compat: old artifacts stored as bare array
  if (Array.isArray(parsed)) {
    return c.json({ recordingId: id, actions: parsed });
  }
  return c.json(parsed);
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
  if (!artifact.length) return c.json({ codegen: '' });
  const parsed = JSON.parse(artifact[0].content as string);
  const actions = Array.isArray(parsed) ? parsed : parsed.actions ?? [];
  try {
    const code = generateCodegen(actions);
    return c.json({ codegen: code });
  } catch (err) {
    console.error('Codegen failed:', err);
    return c.json({ codegen: '' });
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

  return c.json({ ok: true });
});

recordingsRouter.post('/:id/start', async (c) => {
  const id = c.req.param('id');
  const agentId = c.req.query('agentId') || 'default';

  const recording = await db.select().from(recordings).where(eq(recordings.id, id)).limit(1);
  if (!recording.length) return c.json({ error: 'not found' }, 404);

  const handlers = getWsHandlers();
  const sent = handlers.sendToAgent(agentId, {
    type: 'record:start',
    payload: {
      targetUrl: recording[0].targetUrl || '',
      recordingId: id,
    },
  });

  if (!sent) return c.json({ error: 'agent not connected' }, 503);
  return c.json({ ok: true });
});

recordingsRouter.post('/:id/stop', async (c) => {
  const id = c.req.param('id');
  const agentId = c.req.query('agentId') || 'default';

  const handlers = getWsHandlers();
  const sent = handlers.sendToAgent(agentId, {
    type: 'record:stop',
    payload: { recordingId: id },
  });

  if (!sent) return c.json({ error: 'agent not connected' }, 503);
  return c.json({ ok: true });
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

  if (!artifact.length) return c.json({ error: 'no actions found' }, 404);

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
      actions: actionsData.actions || [],
      harRef: useMock ? `${id}/recording.har` : '',
      mockRules,
    },
  });

  if (!sent) return c.json({ error: 'agent not connected' }, 503);
  return c.json({ ok: true, executionId: execution[0].id });
});

recordingsRouter.delete('/batch', async (c) => {
  const body = await c.req.json();
  const ids = body.ids as string[];
  if (!ids || ids.length === 0) return c.json({ error: 'missing ids' }, 400);
  try {
    for (const id of ids) {
      await deleteRecording(id);
    }
    return c.json({ ok: true, deleted: ids.length });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

recordingsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await deleteRecording(id);
    return c.json({ ok: true });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
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
