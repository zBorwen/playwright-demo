import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index.js';
import { recordings, recordingArtifacts, executions } from '../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';
import type { Recording } from '@playwright-demo/shared';
import type { Env } from '../types/env.js';
import { getWsHandlers } from '../context.js';

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
    .limit(1);
  if (!artifact.length) return c.json({ error: 'not found' }, 404);
  return c.json(JSON.parse(artifact[0].content as string));
});

recordingsRouter.post('/:id/actions', zValidator('json', z.object({
  actions: z.array(z.object({ name: z.string() })),
})), async (c) => {
  const id = c.req.param('id');
  const { actions } = c.req.valid('json');
  const content = JSON.stringify({ recordingId: id, actions });

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
      harRef: useMock ? `${id}.har` : '',
      mockRules: [],
    },
  });

  if (!sent) return c.json({ error: 'agent not connected' }, 503);
  return c.json({ ok: true, executionId: execution[0].id });
});
