import { Hono } from 'hono';
import { zValidator } from '../middleware/zod-validator';
import { z } from 'zod';
import { db } from '../db/index';
import { executions, executionArtifacts } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { successResponse, errorResponse, API_CODES } from '../middleware/response';
import { validateUuidParam } from '../middleware/uuid-validator';
import type { Context } from 'hono';
import type { Env } from '../types/env';

export const executionsRouter = new Hono();

executionsRouter.use('/:id*', validateUuidParam('id'));

const createExecutionSchema = z.object({
  recordingId: z.string().uuid(),
  status: z.enum(['running', 'passed', 'failed']),
});

executionsRouter.get('/', async (c) => {
  const recordingId = c.req.query('recordingId');
  const query = db.select().from(executions);
  const filtered = recordingId ? query.where(eq(executions.recordingId, recordingId)) : query;
  const list = await filtered.orderBy(desc(executions.startedAt));
  return c.json(successResponse(list));
});

executionsRouter.post('/', zValidator('json', createExecutionSchema), async (c) => {
  const body = c.req.valid('json');
  const result = await db.insert(executions).values(body).returning();
  return c.json(successResponse(result[0]), 201);
});

executionsRouter.get('/summary', async (c) => {
  const { recordings } = await import('../db/schema');
  
  // Total recordings
  const allRecordingIds = await db.select({ id: recordings.id }).from(recordings);
  const totalRecordings = allRecordingIds.length;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // All executions (for pass rate)
  const allExecs = await db.select({ id: executions.id, status: executions.status }).from(executions);
  const totalExecs = allExecs.length;
  const passedCount = allExecs.filter(e => e.status === 'passed').length;
  const passRate = totalExecs > 0 ? Math.round((passedCount / totalExecs) * 100) : 0;

  // Executions from the last 7 days
  const recentExecs = await db.select()
    .from(executions)
    // where startedAt >= weekAgo
    .orderBy(desc(executions.startedAt));
  
  const todayExecutions = recentExecs.filter(e => e.startedAt && new Date(e.startedAt) >= todayStart).length;
  
  const recentFailures = recentExecs.filter(e => e.status === 'failed').slice(0, 5);

  const dailyMap = new Map<string, { passed: number; failed: number }>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    dailyMap.set(key, { passed: 0, failed: 0 });
  }

  for (const e of recentExecs) {
    if (!e.startedAt) continue;
    const d = new Date(e.startedAt);
    if (d >= weekAgo) {
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      const day = dailyMap.get(key);
      if (day) {
        if (e.status === 'passed') day.passed++;
        else if (e.status === 'failed') day.failed++;
      }
    }
  }

  return c.json(successResponse({
    totalRecordings,
    todayExecutions,
    passRate,
    recentFailures,
    trendData: Array.from(dailyMap.entries()).map(([date, data]) => ({
      date,
      passed: data.passed,
      failed: data.failed,
    })),
  }));
});

executionsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const targetExecution = await db.select().from(executions).where(eq(executions.id, id)).limit(1);
  if (!targetExecution.length) return c.json(errorResponse(API_CODES.NOT_FOUND, '执行记录不存在'), 404);
  return c.json(successResponse(targetExecution[0]));
});

executionsRouter.get('/:id/artifacts', async (c) => {
  const id = c.req.param('id');
  const artifacts = await db
    .select()
    .from(executionArtifacts)
    .where(eq(executionArtifacts.executionId, id));
  return c.json(successResponse(artifacts));
});

executionsRouter.get('/:id/trace', async (c: Context<Env>) => {
  const id = c.req.param('id');
  if (!id) return c.json(errorResponse(API_CODES.NOT_FOUND, 'Trace 文件不存在'), 404);
  const storage = c.var.storage;
  const traceBuffer = await storage.loadTrace(id);
  if (!traceBuffer) return c.json(errorResponse(API_CODES.NOT_FOUND, 'Trace 文件不存在'), 404);
  return c.body(new Uint8Array(traceBuffer), 200, {
    'Content-Type': 'application/zip',
  });
});

const updateExecutionSchema = z.object({
  status: z.enum(['running', 'passed', 'failed']).optional(),
  error: z.string().optional(),
}).strict();

executionsRouter.patch('/:id', zValidator('json', updateExecutionSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  await db
    .update(executions)
    .set({ ...body, finishedAt: new Date() })
    .where(eq(executions.id, id));
  return c.json(successResponse({ ok: true }));
});
