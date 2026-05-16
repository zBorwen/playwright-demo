import { Hono } from 'hono';
import { zValidator } from '../middleware/zod-validator';
import { z } from 'zod';
import { db } from '../db/index';
import { projects, recordings, recordingArtifacts, executions } from '../db/schema';
import { eq, inArray, desc } from 'drizzle-orm';
import { successResponse, errorResponse, API_CODES } from '../middleware/response';

export const projectsRouter = new Hono();

const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

projectsRouter.get('/', async (c) => {
  const list = await db.select().from(projects).orderBy(projects.createdAt);
  
  // Aggregate stats: recording count and last executed at
  // Note: we can do a query to count recordings per project
  const allRecordings = await db.select({ id: recordings.id, projectId: recordings.projectId }).from(recordings);
  
  // Find last execution for all recordings
  const allExecutions = await db
    .select({ recordingId: executions.recordingId, finishedAt: executions.finishedAt })
    .from(executions)
    .where(inArray(executions.status, ['passed', 'failed']))
    .orderBy(desc(executions.finishedAt));

  const statsMap = new Map<string, { recordingCount: number; lastExecutedAt: string | null }>();
  
  // Initialize map
  for (const p of list) {
    statsMap.set(p.id, { recordingCount: 0, lastExecutedAt: null });
  }

  // Count recordings
  const recordingToProject = new Map<string, string>();
  for (const r of allRecordings) {
    const stats = statsMap.get(r.projectId);
    if (stats) stats.recordingCount++;
    recordingToProject.set(r.id, r.projectId);
  }

  // Find latest execution
  for (const ex of allExecutions) {
    if (!ex.finishedAt) continue;
    const projectId = recordingToProject.get(ex.recordingId);
    if (!projectId) continue;
    const stats = statsMap.get(projectId);
    if (stats && !stats.lastExecutedAt) {
      // Because allExecutions is ordered by finishedAt DESC, the first one we see is the latest
      stats.lastExecutedAt = ex.finishedAt.toISOString();
    }
  }

  const resultList = list.map(p => ({
    ...p,
    stats: statsMap.get(p.id) || { recordingCount: 0, lastExecutedAt: null }
  }));

  return c.json(successResponse(resultList));
});

projectsRouter.post('/', zValidator('json', createProjectSchema), async (c) => {
  const body = c.req.valid('json');
  const result = await db.insert(projects).values(body).returning();
  return c.json(successResponse(result[0]), 201);
});

projectsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const project = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project.length) return c.json(errorResponse(API_CODES.NOT_FOUND, '项目不存在'), 404);
  return c.json(successResponse(project[0]));
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
  return c.json(successResponse({ deleted: true }));
});

projectsRouter.patch('/:id', zValidator('json', z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  replaySpeed: z.enum(['fast', 'normal', 'slow']).optional(),
})), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const result = await db
    .update(projects)
    .set({ ...body, updatedAt: new Date() })
    .where(eq(projects.id, id))
    .returning();
  if (!result.length) return c.json(errorResponse(API_CODES.NOT_FOUND, '项目不存在'), 404);
  return c.json(successResponse(result[0]));
});
