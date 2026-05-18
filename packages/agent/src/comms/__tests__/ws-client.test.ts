import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WsClient } from '../ws-client';
import WebSocket from 'ws';

vi.mock('ws', () => {
  const MockWS = vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
    readyState: 1, // OPEN
    removeAllListeners: vi.fn(),
  }));
  (MockWS as any).OPEN = 1;
  (MockWS as any).CONNECTING = 0;
  (MockWS as any).CLOSED = 3;
  (MockWS as any).CLOSING = 2;
  return {
    default: MockWS,
  };
});

describe('WsClient', () => {
  const url = 'ws://localhost:3000';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('buffers messages when disconnected', () => {
    const client = new WsClient(url);
    // No WS instance yet, readyState will be checked on send
    client.send({ type: 'pong' });
    
    expect((client as any).messageBuffer).toHaveLength(1);
  });

  it('sends messages immediately when connected', async () => {
    const client = new WsClient(url);
    const mockWs = new WebSocket(url);
    (client as any).ws = mockWs;
    (mockWs as any).readyState = 1; // OPEN

    client.send({ type: 'pong' });
    expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'pong' }));
  });
});
