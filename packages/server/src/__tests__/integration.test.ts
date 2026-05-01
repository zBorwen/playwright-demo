import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { StorageService } from '../services/storage';
import * as dbModule from '../db/index';

// Mock the database module before importing routes
vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => Promise.resolve([])),
          limit: vi.fn(() => Promise.resolve([])),
        })),
        orderBy: vi.fn(() => Promise.resolve([])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{ id: 'test-id' }])),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  },
  client: { end: vi.fn() },
  projects: {
    id: {},
    name: {},
    description: {},
    createdAt: {},
    updatedAt: {},
  },
  recordings: {
    id: {},
    projectId: {},
    title: {},
    targetUrl: {},
    createdAt: {},
    updatedAt: {},
  },
  recordingArtifacts: {
    id: {},
    recordingId: {},
    type: {},
    content: {},
  },
  executions: {
    id: {},
    recordingId: {},
    status: {},
    startedAt: {},
    finishedAt: {},
    error: {},
    trace: {},
  },
  executionArtifacts: {
    id: {},
    executionId: {},
    type: {},
    path: {},
    stepIndex: {},
  },
}));

// Mock context to avoid ws dependencies
vi.mock('../context.js', () => ({
  getWsHandlers: vi.fn(() => ({
    sendToAgent: vi.fn(() => true),
  })),
}));

// Import routes after mocking
import { projectsRouter } from '../routes/projects';

import type { Env } from '../types/env';

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
  });

  describe('GET /api/projects', () => {
    it('returns projects list', async () => {
      const mockProjects = [
        { id: '1', name: 'Project A', description: null, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
      ];

      const orderByMock = vi.fn(() => Promise.resolve(mockProjects));
      const fromMock = vi.fn(() => ({ orderBy: orderByMock }));
      const selectMock = vi.fn(() => ({ from: fromMock }));
      (dbModule.db as any).select = selectMock;

      const res = await testApp.request('/api/projects');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(mockProjects);
    });
  });

  describe('POST /api/projects', () => {
    it('creates a project with valid name', async () => {
      const returningMock = vi.fn(() => Promise.resolve([{ id: 'test-id', name: 'New Project' }]));
      const valuesMock = vi.fn(() => ({ returning: returningMock }));
      (dbModule.db as any).insert = vi.fn(() => ({ values: valuesMock }));

      const res = await testApp.request('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Project' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toEqual({ id: 'test-id', name: 'New Project' });
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
