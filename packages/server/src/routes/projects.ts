import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index';
import { projects, recordings, recordingArtifacts, executions } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';

export const projectsRouter = new Hono();

const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

projectsRouter.get('/', async (c) => {
  const list = await db.select().from(projects).orderBy(projects.createdAt);
  return c.json(list);
});

projectsRouter.post('/', zValidator('json', createProjectSchema), async (c) => {
  const body = c.req.valid('json');
  const result = await db.insert(projects).values(body).returning();
  return c.json(result[0], 201);
});

projectsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const project = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project.length) return c.json({ error: 'not found' }, 404);
  return c.json(project[0]);
});

projectsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');

  // Find all recordings for this project
  const recs = await db.select({ id: recordings.id }).from(recordings).where(eq(recordings.projectId, id));
  if (recs.length > 0) {
    const recIds = recs.map(r => r.id);
    // Delete recording artifacts and executions for each recording
    await db.delete(recordingArtifacts).where(inArray(recordingArtifacts.recordingId, recIds));
    await db.delete(executions).where(inArray(executions.recordingId, recIds));
    // Delete recordings
    await db.delete(recordings).where(inArray(recordings.id, recIds));
  }

  // Delete the project itself
  await db.delete(projects).where(eq(projects.id, id));
  return c.json({ ok: true });
});
