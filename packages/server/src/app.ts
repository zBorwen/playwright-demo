import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { StorageService } from './services/storage';
import { projectsRouter } from './routes/projects';
import { recordingsRouter } from './routes/recordings';
import { executionsRouter } from './routes/executions';
import { networkRouter } from './routes/network';
import { errorHandler } from './middleware/error-handler';
import { successResponse } from './middleware/response';
import type { Env } from './types/env';

const app = new Hono<Env>();

app.use('*', cors());

// Inject storage to context
app.use('*', async (c, next) => {
  c.set('storage', new StorageService());
  await next();
});

// Global error handler
app.onError(errorHandler());

// Health check
app.get('/health', (c) => c.json(successResponse({ status: 'ok' })));

// Routes
app.route('/api/projects', projectsRouter);
app.route('/api/recordings', recordingsRouter);
app.route('/api/recordings/:id/network', networkRouter);
app.route('/api/executions', executionsRouter);

export { app };
