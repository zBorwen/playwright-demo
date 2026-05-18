import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WsHandlers } from '../ws-handlers';

describe('WsHandlers', () => {
  const mockStorage = {} as any;
  const mockWs = {
    send: vi.fn(),
    readyState: 1, // OPEN
  } as any;

  let handlers: WsHandlers;

  beforeEach(() => {
    handlers = new WsHandlers(mockStorage);
    vi.clearAllMocks();
  });

  it('registers and unregisters clients', () => {
    handlers.registerClient(mockWs);
    expect((handlers as any).clients.has(mockWs)).toBe(true);

    handlers.unregisterClient(mockWs);
    expect((handlers as any).clients.has(mockWs)).toBe(false);
  });

  it('broadcasts to clients', () => {
    const mockWs2 = { send: vi.fn(), readyState: 1 } as any;
    handlers.registerClient(mockWs);
    handlers.registerClient(mockWs2);

    const data = JSON.stringify({ type: 'test' });
    handlers.broadcastToClients(data);

    expect(mockWs.send).toHaveBeenCalledWith(data);
    expect(mockWs2.send).toHaveBeenCalledWith(data);
  });

  it('registers agents and tracks active recordings', () => {
    handlers.registerAgent('agent-1', mockWs);
    
    // Simulate sending a start command
    handlers.sendToAgent('agent-1', { 
      type: 'record:start', 
      payload: { recordingId: 'rec-1', targetUrl: 'http://example.com' } 
    });

    const agent = (handlers as any).agents.get('agent-1');
    expect(agent.activeRecordingIds.has('rec-1')).toBe(true);
  });
});
