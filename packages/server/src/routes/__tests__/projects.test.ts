import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { StorageService } from '../../services/storage';
import * as dbModule from '../../db/index';

// Create a flexible, chainable, thenable mock
const createMockQueryBuilder = (defaultResult: any = []) => {
  const builder: any = {
    _result: defaultResult,
    from: vi.fn().mockImplementation(() => builder),
    where: vi.fn().mockImplementation(() => builder),
    orderBy: vi.fn().mockImplementation(() => builder),
    limit: vi.fn().mockImplementation(() => builder),
    returning: vi.fn().mockImplementation(() => Promise.resolve([{ id: 'test-id' }])),
    then: vi.fn().mockImplementation((onfulfilled: any) => 
      Promise.resolve(builder._result).then(onfulfilled)
    ),
  };
  return builder;
};

let activeMockQueryBuilder = createMockQueryBuilder();

// Mock the database module before importing routes
vi.mock('../../db/index.js', () => {
  return {
    db: {
      select: vi.fn(() => activeMockQueryBuilder),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: 'test-id' }])),
        })),
      })),
      delete: vi.fn(() => activeMockQueryBuilder),
      update: vi.fn(() => ({
        set: vi.fn(() => activeMockQueryBuilder),
      })),
      query: {
        recordings: {
          findFirst: vi.fn(() => Promise.resolve(null)),
        },
      },
    },
    client: { end: vi.fn() },
    projects: { id: {}, name: {}, description: {}, createdAt: {}, updatedAt: {} },
    recordings: { id: {}, projectId: {}, title: {}, targetUrl: {}, createdAt: {}, updatedAt: {} },
    recordingArtifacts: { id: {}, recordingId: {}, type: {}, content: {} },
    executions: { id: {}, recordingId: {}, status: {}, startedAt: {}, finishedAt: {}, error: {}, trace: {} },
    executionArtifacts: { id: {}, executionId: {}, type: {}, path: {}, stepIndex: {} },
  };
});

// Mock context to avoid ws dependencies
vi.mock('../../context.js', () => ({
  getWsHandlers: vi.fn(() => ({
    sendToAgent: vi.fn(() => true),
  })),
}));

// Import routes after mocking
import { projectsRouter } from '../projects';

import type { Env } from '../../types/env';

describe('Projects routes', () => {
  const testApp = new Hono<Env>();
  testApp.use('*', cors());

  const storage = new StorageService();
  testApp.use('*', async (c, next) => {
    c.set('storage', storage);
    await next();
  });
  testApp.route('/api/projects', projectsRouter);

  beforeEach(() => {
    vi.clearAllMocks();
    activeMockQueryBuilder = createMockQueryBuilder();
  });

  describe('GET /api/projects', () => {
    it('returns projects list', async () => {
      const mockProjects = [
        { id: '1', name: 'Project A', description: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ];

      // Handle the sequence of 3 select calls
      let callCount = 0;
      (dbModule.db as any).select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return createMockQueryBuilder(mockProjects);
        return createMockQueryBuilder([]);
      });

      const res = await testApp.request('/api/projects');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data[0].id).toBe('1');
      expect(body.data[0].stats).toBeDefined();
    });
  });

  describe('POST /api/projects', () => {
    it('creates a project with valid name', async () => {
      const res = await testApp.request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Project' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toEqual({ success: true, data: { id: 'test-id' }, code: 'OK' });
    });

    it('rejects project with empty name', async () => {
      const res = await testApp.request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '' }),
      });

      expect(res.status).toBe(400);
    });
  });
});

describe('StorageService', () => {
  it('can be instantiated', () => {
    const storage = new StorageService('/tmp/test-storage');
    expect(storage).toBeDefined();
  });
});
