import { z } from 'zod';

export const ReplaySpeedSchema = z.enum(['fast', 'normal', 'slow']);

export const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  replaySpeed: ReplaySpeedSchema.default('normal'),
  createdAt: z.string(),
  updatedAt: z.string(),
  stats: z.object({
    recordingCount: z.number(),
    lastExecutedAt: z.string().nullable(),
  }).optional(),
});

export const RecordingSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  title: z.string(),
  targetUrl: z.string().url().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ExecutionStatusSchema = z.enum(['running', 'passed', 'failed']);

export const ExecutionSchema = z.object({
  id: z.string().uuid(),
  recordingId: z.string().uuid(),
  status: ExecutionStatusSchema,
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  error: z.string().optional(),
  trace: z.string().optional(),
});

export const ExecutionArtifactSchema = z.object({
  id: z.string().uuid(),
  executionId: z.string().uuid(),
  type: z.enum(['screenshot', 'har']),
  path: z.string(),
  stepIndex: z.number().optional(),
});

export const ExecutionSummarySchema = z.object({
  totalRecordings: z.number(),
  todayExecutions: z.number(),
  passRate: z.number(),
  recentFailures: z.array(ExecutionSchema),
  trendData: z.array(z.object({
    date: z.string(),
    passed: z.number(),
    failed: z.number(),
  })),
});
