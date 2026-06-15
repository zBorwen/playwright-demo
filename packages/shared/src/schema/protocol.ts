import { z } from 'zod';
import { 
  RecordingActionSchema, 
  MockRuleSchema, 
  ElementInfoSchema 
} from './actions.js';

export const BrowserTypeSchema = z.enum(['chromium', 'firefox', 'webkit']);

// ---------------------------------------------------------------------------
// Server Messages (Server -> Agent)
// ---------------------------------------------------------------------------

export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('record:start'),
    payload: z.object({
      targetUrl: z.string().url(),
      recordingId: z.string().uuid(),
      headless: z.boolean().optional(),
      browserType: BrowserTypeSchema.optional(),
    }),
  }),
  z.object({
    type: z.literal('record:stop'),
    payload: z.object({
      recordingId: z.string().uuid(),
    }),
  }),
  z.object({
    type: z.literal('replay:start'),
    payload: z.object({
      recordingId: z.string().uuid(),
      executionId: z.string().uuid(),
      // 回放启动时传入基础 Action 列表（不含录制元数据）
      actions: z.array(RecordingActionSchema),
      harRef: z.string().optional(),
      mockRules: z.array(MockRuleSchema).default([]),
      replaySpeed: z.enum(['fast', 'normal', 'slow']).optional(),
      headless: z.boolean().optional(),
      browserType: BrowserTypeSchema.optional(),
    }),
  }),
  z.object({
    type: z.literal('ping'),
  }),
]);

// ---------------------------------------------------------------------------
// Agent Messages (Agent -> Server/Frontend)
// ---------------------------------------------------------------------------

export const AgentMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('record:action'),
    payload: z.object({
      recordingId: z.string().uuid(),
      action: RecordingActionSchema,
      code: z.string().optional(),
      // Redundant but kept for backward compatibility if needed, 
      // or we can remove them if we update Agent/Server
      selector: z.string().optional(),
      elementInfo: ElementInfoSchema.optional(),
      timestamp: z.number().optional(),
    }),
  }),
  z.object({
    type: z.literal('record:complete'),
    payload: z.object({
      recordingId: z.string().uuid(),
      actions: z.array(RecordingActionSchema),
      harPath: z.string().optional(),
      codegen: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('replay:step'),
    payload: z.object({
      executionId: z.string().uuid(),
      recordingId: z.string().uuid(),
      index: z.number(),
      status: z.enum(['completed', 'failed']),
      error: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('replay:artifact'),
    payload: z.object({
      executionId: z.string().uuid(),
      recordingId: z.string().uuid(),
      index: z.number(), // step index
      type: z.enum(['screenshot', 'har', 'trace']),
      path: z.string(), // server relative path or agent local path depending on context
    }),
  }),
  z.object({
    type: z.literal('replay:done'),
    payload: z.object({
      executionId: z.string().uuid(),
      recordingId: z.string().uuid(),
      status: z.enum(['passed', 'failed']),
      error: z.string().optional(),
      trace: z.string().optional(),
      screenshot: z.string().optional(),
      tracePath: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('pong'),
  }),
]);
