import type { Action, ElementInfo, Recording, MockRule } from '../schema/actions.js';

export type ServerMessage =
  | { type: 'record:start'; payload: { targetUrl: string; recordingId: string } }
  | { type: 'record:stop'; payload: { recordingId: string } }
  | { type: 'replay:start'; payload: { recordingId: string; executionId: string; actions: Action[]; harRef: string; mockRules: MockRule[]; replaySpeed?: 'fast' | 'normal' | 'slow' } }
  | { type: 'ping' };

export type AgentMessage =
  | { type: 'record:action'; payload: { action: Action; code?: string; selector: string; elementInfo: ElementInfo; timestamp: number } }
  | { type: 'record:complete'; payload: { recordingId: string; actions: Recording['actions']; harPath: string; codegen: string } }
  | { type: 'replay:step'; payload: { executionId: string; recordingId: string; index: number; status: 'completed' | 'failed'; error?: string } }
  | { type: 'replay:done'; payload: { executionId: string; recordingId: string; status: 'passed' | 'failed'; error?: string; trace?: string; screenshot?: string; tracePath?: string } }
  | { type: 'pong' };
