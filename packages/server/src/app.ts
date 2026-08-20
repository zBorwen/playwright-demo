import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { StorageService } from './services/storage';
import { projectsRouter } from './routes/projects';
import { recordingsRouter } from './routes/recordings';
import { executionsRouter } from './routes/executions';
import { networkRouter } from './routes/network';
import { issuesRouter } from './routes/issues';
import { errorHandler } from './middleware/error-handler';
import { successResponse } from './middleware/response';
import type { Env } from './types/env';

const app = new Hono<Env>();

app.use('*', cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
  credentials: true,
}));

// 安全头中间件
app.use('*', async (c, next) => {
  await next();
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('X-Frame-Options', 'DENY');
  c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  c.res.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; frame-ancestors 'none';");
  c.res.headers.set('X-XSS-Protection', '1; mode=block');
  c.res.headers.set('Referrer-Policy', 'no-referrer-when-downgrade');
});

// Inject storage to context
app.use('*', async (c, next) => {
  c.set('storage', new StorageService());
  await next();
});

// Global error handler
app.onError(errorHandler());

// Health check
app.get('/health', (c) => c.json(successResponse({ status: 'ok' })));

// Serve Playwright Trace Viewer static files
app.use('/trace-viewer/*', serveStatic({
  root: './node_modules/playwright-core/lib/vite/traceViewer',
  rewriteRequestPath: (p) => p.replace(/^\/trace-viewer/, ''),
}));
app.get('/trace-viewer/*', serveStatic({
  root: './node_modules/playwright-core/lib/vite/traceViewer',
  rewriteRequestPath: (p) => p.replace(/^\/trace-viewer/, ''),
}));

// Routes
app.route('/api/projects', projectsRouter);
app.route('/api/recordings', recordingsRouter);
app.route('/api/recordings/:id/network', networkRouter);
app.route('/api/executions', executionsRouter);
app.route('/api/issues', issuesRouter);

export { app };
