import type { BrowserType, MockRule, RecordingAction } from '@playwright-demo/shared';

export interface PendingTask {
  type: 'task:replay' | 'task:record:start' | 'task:record:stop';
  id: string; // recordingId or executionId
  payload: any;
}

export interface TaskReplayPayload {
  executionId: string;
  recordingId: string;
  actions: RecordingAction[];
  harPath?: string;
  harRef?: string; // Original WS field
  mockRules: MockRule[];
  headless: boolean;
  browserType: BrowserType;
  replaySpeed?: 'fast' | 'normal' | 'slow'; // Original WS field
  stepDelay: number;
  useMock: boolean;
}

export interface TaskRecordStartPayload {
  recordingId: string;
  targetUrl: string;
  headless: boolean;
  browserType: BrowserType;
}

export interface TaskRecordStopPayload {
  recordingId: string;
}

export type TaskMessage = 
  | { type: 'task:replay'; id: string; payload: TaskReplayPayload }
  | { type: 'task:record:start'; id: string; payload: TaskRecordStartPayload }
  | { type: 'task:record:stop'; id: string; payload: TaskRecordStopPayload };
