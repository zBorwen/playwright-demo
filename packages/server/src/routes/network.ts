import { Hono } from 'hono';
import { zValidator } from '../middleware/zod-validator';
import { z } from 'zod';
import { db } from '../db/index';
import { recordingArtifacts } from '../db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { successResponse, errorResponse, API_CODES } from '../middleware/response';

export const networkRouter = new Hono();

// GET /api/recordings/:id/network — 返回过滤后的 NetworkEntry[]
networkRouter.get('/', async (c) => {
  const recordingId = c.req.param('id')!;

  const artifacts = await db
    .select()
    .from(recordingArtifacts)
    .where(eq(recordingArtifacts.recordingId, recordingId))
    .orderBy(desc(recordingArtifacts.createdAt));

  const harArtifact = artifacts.find((a) => a.type === 'har');
  if (!harArtifact || !harArtifact.content) {
    return c.json(successResponse({ entries: [] }));
  }

  const entries = JSON.parse(harArtifact.content) as unknown[];
  return c.json(successResponse({ entries }));
});

// GET /api/recordings/:id/network/mock-rules — 返回 MockRule[]
networkRouter.get('/mock-rules', async (c) => {
  const recordingId = c.req.param('id')!;

  const artifacts = await db
    .select()
    .from(recordingArtifacts)
    .where(eq(recordingArtifacts.recordingId, recordingId))
    .orderBy(desc(recordingArtifacts.createdAt));

  const mockArtifact = artifacts.find((a) => a.type === 'mock_rules');
  if (!mockArtifact || !mockArtifact.content) {
    return c.json(successResponse({ rules: [] }));
  }

  const rules = JSON.parse(mockArtifact.content) as unknown[];
  return c.json(successResponse({ rules }));
});

// POST /api/recordings/:id/network/mock-rules — 保存 MockRule[]
const mockRulesSchema = z.array(
  z.object({
    urlPattern: z.string(),
    enabled: z.boolean(),
    method: z.string().optional(),
    statusCode: z.number().optional(),
    contentType: z.string().optional(),
    responseBody: z.string().optional(),
    responseHeaders: z.record(z.string()).optional(),
  }),
);

networkRouter.post('/mock-rules', zValidator('json', z.object({ rules: mockRulesSchema })), async (c) => {
  const recordingId = c.req.param('id')!;
  const { rules } = c.req.valid('json');

  // Upsert: delete only existing mock_rules artifact, preserve actions and har
  await db
    .delete(recordingArtifacts)
    .where(and(
      eq(recordingArtifacts.recordingId, recordingId),
      eq(recordingArtifacts.type, 'mock_rules'),
    ));

  await db.insert(recordingArtifacts).values({
    recordingId,
    type: 'mock_rules',
    content: JSON.stringify(rules),
  });

  return c.json(successResponse({ ok: true }));
});
