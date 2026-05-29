import type { Page } from 'playwright-core';

export interface RecorderActionData {
  action: {
    name: string;
    selector?: string;
    url?: string;
    value?: string;
    text?: string;
    key?: string;
    options?: string[];
    checked?: boolean;
    signals?: unknown[];
  };
  frame: { pageGuid: string };
}

export interface RecorderEventSink {
  actionAdded?: (page: Page, data: RecorderActionData, code: string) => Promise<void> | void;
  actionUpdated?: (page: Page, data: RecorderActionData, code: string) => Promise<void> | void;
  signalAdded?: (page: Page, data: Record<string, unknown>) => Promise<void> | void;
}

export interface EnableRecorderParams {
  mode: 'recording' | 'inspecting' | 'none';
  recorderMode: 'api' | 'default';
  language: 'playwright-test' | 'javascript' | 'python' | 'java' | 'csharp';
  launchOptions?: Record<string, unknown>;
  contextOptions?: Record<string, unknown>;
  handleSIGINT?: boolean;
  hideToolbar?: boolean;
  testIdAttributeName?: string;
  outputFile?: string;
}

declare module 'playwright-core' {
  interface BrowserContext {
    _enableRecorder(params: EnableRecorderParams, eventSink: RecorderEventSink): Promise<void>;
  }
}
