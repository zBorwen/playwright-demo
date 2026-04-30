import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { StorageService } from './services/storage.js';
import { projectsRouter } from './routes/projects.js';
import { recordingsRouter } from './routes/recordings.js';
import { executionsRouter } from './routes/executions.js';
import { networkRouter } from './routes/network.js';
import type { Env } from './types/env.js';

const app = new Hono<Env>();

app.use('*', cors());

const storage = new StorageService();

// Inject storage to context
app.use('*', async (c, next) => {
  c.set('storage', storage);
  await next();
});

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }));

// Routes
app.route('/api/projects', projectsRouter);
app.route('/api/recordings', recordingsRouter);
app.route('/api/recordings/:id/network', networkRouter);
app.route('/api/executions', executionsRouter);

export { app };
