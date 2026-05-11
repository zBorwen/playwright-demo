import { serve } from '@hono/node-server';
import { app } from './app';
import { WebSocketServer } from 'ws';
import type { Server } from 'http';
import type { AgentMessage } from '@playwright-demo/shared';
import { StorageService } from './services/storage';
import { WsHandlers } from './ws-handlers';
import { setContext } from './context';

const port = parseInt(process.env.PORT || '3000');
const storage = new StorageService();

const server = serve({
  fetch: app.fetch,
  port,
});

console.log(`Server running on http://localhost:${port}`);

const wsHandlers = new WsHandlers(storage);
setContext(wsHandlers);

const wss = new WebSocketServer({ server: server as unknown as Server, path: '/ws' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '', 'http://localhost');
  const agentId = url.searchParams.get('agentId');

  if (agentId) {
    wsHandlers.registerAgent(agentId, ws);
  } else {
    wsHandlers.registerClient(ws);
    console.log('Frontend client connected');
  }

  ws.on('message', async (data) => {
    try {
      const parsed = JSON.parse(data.toString());
      if (!parsed || typeof parsed.type !== 'string') {
        console.error('Invalid message: missing type field');
        return;
      }
      const msg = parsed as AgentMessage;
      await wsHandlers.handleAgentMessage(ws, msg);
    } catch (e) {
      console.error('Invalid message:', e);
    }
  });

  const interval = setInterval(() => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'ping' }));
    } else {
      clearInterval(interval);
    }
  }, 30_000);

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    if (agentId) {
      wsHandlers.unregisterAgent(ws);
    } else {
      wsHandlers.unregisterClient(ws);
    }
    clearInterval(interval);
  });

  ws.on('close', () => {
    clearInterval(interval);
    if (agentId) {
      wsHandlers.unregisterAgent(ws);
    } else {
      wsHandlers.unregisterClient(ws);
    }
    console.log(agentId ? `Agent ${agentId} disconnected` : 'Frontend client disconnected');
  });
});
