import { serve } from '@hono/node-server';
import { app } from './app.js';
import { WebSocketServer } from 'ws';
import type { Server } from 'http';
import type { AgentMessage } from '@playwright-demo/shared';
import { StorageService } from './services/storage.js';
import { WsHandlers } from './ws-handlers.js';

const port = parseInt(process.env.PORT || '3000');
const storage = new StorageService();

const server = serve({
  fetch: app.fetch,
  port,
});

console.log(`Server running on http://localhost:${port}`);

const wsHandlers = new WsHandlers(storage);
const wss = new WebSocketServer({ server: server as unknown as Server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('Agent connected');
  wsHandlers.registerClient(ws);

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString()) as AgentMessage;
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

  ws.on('close', () => {
    clearInterval(interval);
    wsHandlers.unregisterClient(ws);
    console.log('Agent disconnected');
  });
});
