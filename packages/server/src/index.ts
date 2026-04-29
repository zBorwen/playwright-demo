import { serve } from '@hono/node-server';
import { app } from './app.js';
import { WebSocketServer } from 'ws';
import type { Server } from 'http';

const port = parseInt(process.env.PORT || '3000');

const server = serve({
  fetch: app.fetch,
  port,
});

console.log(`Server running on http://localhost:${port}`);

// WebSocket Server for Agent connections
const wss = new WebSocketServer({ server: server as unknown as Server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('Agent connected');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('Received:', message.type);
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
    console.log('Agent disconnected');
  });
});
