import type { Action, ElementInfo, Recording, NetworkEntry, MockRule } from '../schema/actions.js';

export type { NetworkEntry, MockRule };

export type ServerMessage =
  | { type: 'record:start'; payload: { targetUrl: string; recordingId: string } }
  | { type: 'record:screenshot'; payload: { actionIndex: number } }
  | { type: 'record:stop'; payload: { recordingId: string } }
  | { type: 'replay:start'; payload: { recordingId: string; executionId: string; actions: Action[]; harRef: string; mockRules: MockRule[] } }
  | { type: 'replay:stop'; payload: { replayId: string } }
  | { type: 'ping' };

export type AgentMessage =
  | { type: 'record:action'; payload: { action: Action; code?: string; selector: string; elementInfo: ElementInfo; timestamp: number } }
  | { type: 'record:screenshot:result'; payload: { actionIndex: number; path: string } }
  | { type: 'record:complete'; payload: { recordingId: string; actions: Recording['actions']; harPath: string; codegen: string } }
  | { type: 'replay:step'; payload: { executionId: string; index: number; status: 'running' } }
  | { type: 'replay:screenshot'; payload: { executionId: string; stepIndex: number; path: string } }
  | { type: 'replay:done'; payload: { executionId: string; status: 'passed' | 'failed'; error?: string; trace?: string; screenshot?: string } }
  | { type: 'pong' };
