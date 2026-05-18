import { describe, it, expect } from 'vitest';
import { ServerMessageSchema, AgentMessageSchema } from '../schema/protocol.js';
import { v4 as uuidv4 } from 'uuid';

describe('ServerMessageSchema', () => {
  it('validates record:start', () => {
    const msg = {
      type: 'record:start',
      payload: {
        targetUrl: 'https://google.com',
        recordingId: '92076e85-8f59-4671-a610-4fabbcee0ce1',
        headless: false,
      },
    };
    expect(ServerMessageSchema.safeParse(msg).success).toBe(true);
  });

  it('validates replay:start', () => {
    const msg = {
      type: 'replay:start',
      payload: {
        recordingId: '92076e85-8f59-4671-a610-4fabbcee0ce1',
        executionId: 'cc7eebe5-d292-47be-86b3-66f92ecf6c95',
        actions: [],
        mockRules: [],
        replaySpeed: 'normal',
      },
    };
    expect(ServerMessageSchema.safeParse(msg).success).toBe(true);
  });

  it('rejects invalid URL in record:start', () => {
    const msg = {
      type: 'record:start',
      payload: {
        targetUrl: 'not-a-url',
        recordingId: '92076e85-8f59-4671-a610-4fabbcee0ce1',
      },
    };
    expect(ServerMessageSchema.safeParse(msg).success).toBe(false);
  });
});

describe('AgentMessageSchema', () => {
  const recordingId = '92076e85-8f59-4671-a610-4fabbcee0ce1';
  const executionId = 'cc7eebe5-d292-47be-86b3-66f92ecf6c95';

  it('validates replay:step', () => {
    const msg = {
      type: 'replay:step',
      payload: {
        executionId,
        recordingId,
        index: 5,
        status: 'completed',
      },
    };
    expect(AgentMessageSchema.safeParse(msg).success).toBe(true);
  });

  it('validates replay:artifact', () => {
    const msg = {
      type: 'replay:artifact',
      payload: {
        executionId,
        recordingId,
        index: 2,
        type: 'screenshot',
        path: 'storage/executions/xxx/screenshots/step-2.jpg',
      },
    };
    expect(AgentMessageSchema.safeParse(msg).success).toBe(true);
  });

  it('validates replay:done', () => {
    const msg = {
      type: 'replay:done',
      payload: {
        executionId,
        recordingId,
        status: 'passed',
      },
    };
    expect(AgentMessageSchema.safeParse(msg).success).toBe(true);
  });
});
