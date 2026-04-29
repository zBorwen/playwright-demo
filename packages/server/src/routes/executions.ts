import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index.js';
import { executions, executionArtifacts } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

export const executionsRouter = new Hono();

const createExecutionSchema = z.object({
  recordingId: z.string().uuid(),
  status: z.enum(['running', 'passed', 'failed']),
});

executionsRouter.get('/', async (c) => {
  const recordingId = c.req.query('recordingId');
  const query = db.select().from(executions);
  if (recordingId) {
    query.where(eq(executions.recordingId, recordingId));
  }
  const list = await query.orderBy(desc(executions.startedAt));
  return c.json(list);
});

executionsRouter.post('/', zValidator('json', createExecutionSchema), async (c) => {
  const body = c.req.valid('json');
  const result = await db.insert(executions).values(body).returning();
  return c.json(result[0], 201);
});

executionsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const ex = await db.select().from(executions).where(eq(executions.id, id)).limit(1);
  if (!ex.length) return c.json({ error: 'not found' }, 404);
  return c.json(ex[0]);
});

executionsRouter.get('/:id/artifacts', async (c) => {
  const id = c.req.param('id');
  const artifacts = await db
    .select()
    .from(executionArtifacts)
    .where(eq(executionArtifacts.executionId, id));
  return c.json(artifacts);
});

executionsRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  await db
    .update(executions)
    .set({ ...body, finishedAt: new Date() })
    .where(eq(executions.id, id));
  return c.json({ ok: true });
});
