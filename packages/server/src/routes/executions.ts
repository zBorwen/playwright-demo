import { Hono } from 'hono';
import { zValidator } from '../middleware/zod-validator';
import { z } from 'zod';
import { db } from '../db/index';
import { executions, executionArtifacts } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { successResponse, errorResponse, API_CODES } from '../middleware/response';
import type { Context } from 'hono';
import type { Env } from '../types/env';

export const executionsRouter = new Hono();

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

executionsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const ex = await db.select().from(executions).where(eq(executions.id, id)).limit(1);
  if (!ex.length) return c.json(errorResponse(API_CODES.NOT_FOUND, '执行记录不存在'), 404);
  return c.json(successResponse(ex[0]));
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
    'Content-Disposition': `attachment; filename="trace-${id}.zip"`,
  });
});

executionsRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  await db
    .update(executions)
    .set({ ...body, finishedAt: new Date() })
    .where(eq(executions.id, id));
  return c.json(successResponse({ ok: true }));
});
