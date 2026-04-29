import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index.js';
import { recordings, recordingArtifacts } from '../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';
import type { Recording } from '@playwright-demo/shared';
import type { Env } from '../types/env.js';

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
  recordingId: z.string(),
  targetUrl: z.string(),
  title: z.string(),
  actions: z.array(z.object({ name: z.string() })),
})), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const content = JSON.stringify(body);

  await db.insert(recordingArtifacts).values({
    recordingId: id,
    type: 'actions',
    content,
  });

  const storage = c.get('storage');
  await storage.saveRecording(id, body as unknown as Recording);

  return c.json({ ok: true });
});
