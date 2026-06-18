import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { StorageService } from '../../services/storage.js';
import * as dbModule from '../../db/index.js';

// Mock the database module before importing routes
vi.mock('../../db/index.js', () => {
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
  const builder = createMockQueryBuilder();
  return {
    db: {
      select: vi.fn(() => builder),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: 'test-id' }])),
        })),
      })),
      delete: vi.fn(() => builder),
      update: vi.fn(() => ({
        set: vi.fn(() => builder),
      })),
      query: {
        recordings: {
          findFirst: vi.fn(),
        },
        projects: {
          findFirst: vi.fn(),
        },
      },
    },
    createMockQueryBuilder,
    client: { end: vi.fn() },
    projects: { id: {}, name: {}, description: {}, createdAt: {}, updatedAt: {} },
    recordings: { id: {}, projectId: {}, title: {}, targetUrl: {}, createdAt: {}, updatedAt: {} },
    recordingArtifacts: { id: {}, recordingId: {}, type: {}, content: {} },
    executions: { id: {}, recordingId: {}, status: {}, startedAt: {}, finishedAt: {}, error: {}, trace: {} },
    executionArtifacts: { id: {}, executionId: {}, type: {}, path: {}, stepIndex: {} },
  };
});

// Mock context to avoid ws dependencies
const mockSendToAgent = vi.fn();
vi.mock('../../context.js', () => ({
  getWsHandlers: vi.fn(() => ({
    sendToAgent: mockSendToAgent,
  })),
}));

// Mock batch-replay-service
const mockLoadActionsArtifact = vi.fn();
const mockLoadMockRules = vi.fn();
const mockLoadValidRecordings = vi.fn();
const mockExecuteBatchReplay = vi.fn();
vi.mock('../../services/batch-replay-service.js', () => ({
  loadActionsArtifact: (...args: any[]) => mockLoadActionsArtifact(...args),
  loadMockRules: (...args: any[]) => mockLoadMockRules(...args),
  loadValidRecordings: (...args: any[]) => mockLoadValidRecordings(...args),
  executeBatchReplay: (...args: any[]) => mockExecuteBatchReplay(...args),
}));

// Mock recording-service
const mockDeleteRecording = vi.fn();
vi.mock('../../services/recording-service.js', () => ({
  deleteRecording: (...args: any[]) => mockDeleteRecording(...args),
}));

// Mock codegen
vi.mock('../../services/codegen.js', () => ({
  generateCodegen: vi.fn(() => '// Generated Playwright Code'),
}));

// Import routes after mocking
import { recordingsRouter } from '../recordings.js';
import type { Env } from '../../types/env.js';

describe('Recordings routes', () => {
  const testApp = new Hono<Env>();
  testApp.use('*', cors());

  const storage = new StorageService();
  testApp.use('*', async (c, next) => {
    c.set('storage', storage);
    await next();
  });
  testApp.route('/api/recordings', recordingsRouter);

  const validUuid = '92076e85-8f59-4671-a610-4fabbcee0ce1';
  const invalidUuid = 'not-a-uuid';

  // Retrieve our mocked query builder helper
  const createMockQueryBuilder = (dbModule as any).createMockQueryBuilder;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendToAgent.mockReset();
    mockLoadActionsArtifact.mockReset();
    mockLoadMockRules.mockReset();
    mockLoadValidRecordings.mockReset();
    mockExecuteBatchReplay.mockReset();
    mockDeleteRecording.mockReset();
  });

  describe('UUID validation middleware', () => {
    it('returns 404 for invalid UUID in path', async () => {
      const res = await testApp.request(`/api/recordings/${invalidUuid}`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/recordings', () => {
    it('returns recordings list without query param', async () => {
      const mockRecs = [
        { id: validUuid, projectId: validUuid, title: 'Rec 1', targetUrl: 'https://test.com', createdAt: new Date() },
      ];
      (dbModule.db.select as any).mockReturnValue(createMockQueryBuilder(mockRecs));

      const res = await testApp.request('/api/recordings');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data[0].id).toBe(validUuid);
    });

    it('returns recordings list filtered by projectId', async () => {
      const mockRecs = [
        { id: validUuid, projectId: validUuid, title: 'Rec 1', targetUrl: 'https://test.com', createdAt: new Date() },
      ];
      (dbModule.db.select as any).mockReturnValue(createMockQueryBuilder(mockRecs));

      const res = await testApp.request(`/api/recordings?projectId=${validUuid}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data[0].projectId).toBe(validUuid);
    });

    it('returns 400 for invalid projectId parameter', async () => {
      const res = await testApp.request(`/api/recordings?projectId=${invalidUuid}`);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/recordings', () => {
    it('creates a recording successfully with existing project', async () => {
      let selectCall = 0;
      (dbModule.db as any).select.mockImplementation(() => {
        selectCall++;
        if (selectCall === 1) return createMockQueryBuilder([{ id: validUuid }]);
        return createMockQueryBuilder();
      });

      const res = await testApp.request('/api/recordings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: validUuid,
          title: 'New Rec',
          targetUrl: 'https://example.com',
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns 404 if project does not exist', async () => {
      (dbModule.db.select as any).mockReturnValue(createMockQueryBuilder([]));

      const res = await testApp.request('/api/recordings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: validUuid,
          title: 'New Rec',
        }),
      });

      expect(res.status).toBe(404);
    });

    it('returns 400 for validation errors', async () => {
      const res = await testApp.request('/api/recordings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: invalidUuid,
          title: '',
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/recordings/:id', () => {
    it('returns details of an existing recording', async () => {
      const rec = { id: validUuid, title: 'Test Rec' };
      (dbModule.db.select as any).mockReturnValue(createMockQueryBuilder([rec]));

      const res = await testApp.request(`/api/recordings/${validUuid}`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(validUuid);
    });

    it('returns 404 if recording does not exist', async () => {
      (dbModule.db.select as any).mockReturnValue(createMockQueryBuilder([]));

      const res = await testApp.request(`/api/recordings/${validUuid}`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/recordings/:id/actions', () => {
    it('returns actions list', async () => {
      const actionsData = { actions: [{ name: 'click', selector: 'button' }] };
      mockLoadActionsArtifact.mockResolvedValue(JSON.stringify(actionsData));

      const res = await testApp.request(`/api/recordings/${validUuid}/actions`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.actions[0].name).toBe('click');
    });

    it('handles old format arrays in actions artifact', async () => {
      const actionsData = [{ name: 'click', selector: 'button' }];
      mockLoadActionsArtifact.mockResolvedValue(JSON.stringify(actionsData));

      const res = await testApp.request(`/api/recordings/${validUuid}/actions`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.actions[0].name).toBe('click');
    });

    it('returns empty array if no actions artifact found', async () => {
      mockLoadActionsArtifact.mockResolvedValue(null);

      const res = await testApp.request(`/api/recordings/${validUuid}/actions`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.actions).toEqual([]);
    });
  });

  describe('GET /api/recordings/:id/codegen', () => {
    it('returns generated playwright code', async () => {
      mockLoadActionsArtifact.mockResolvedValue(JSON.stringify({ actions: [] }));

      const res = await testApp.request(`/api/recordings/${validUuid}/codegen?browserType=chromium`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.codegen).toBe('// Generated Playwright Code');
    });

    it('returns empty string if actions artifact is missing', async () => {
      mockLoadActionsArtifact.mockResolvedValue(null);

      const res = await testApp.request(`/api/recordings/${validUuid}/codegen`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.codegen).toBe('');
    });
  });

  describe('POST /api/recordings/:id/actions', () => {
    it('updates actions and storage successfully', async () => {
      const rec = { id: validUuid, targetUrl: 'http://test.com', title: 'Rec' };
      (dbModule.db.select as any).mockReturnValue(createMockQueryBuilder([rec]));

      const res = await testApp.request(`/api/recordings/${validUuid}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actions: [{ name: 'click', selector: '.btn' }],
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns 400 for invalid action payloads', async () => {
      const res = await testApp.request(`/api/recordings/${validUuid}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actions: 'not-an-array',
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/recordings/:id/start', () => {
    it('starts recording on agent successfully', async () => {
      (dbModule.db.select as any).mockReturnValue(createMockQueryBuilder([{ id: validUuid, targetUrl: 'http://t.com' }]));
      mockSendToAgent.mockReturnValue(true);

      const res = await testApp.request(`/api/recordings/${validUuid}/start?agentId=ag1&browserType=chromium`, {
        method: 'POST',
      });
      expect(res.status).toBe(200);
      expect(mockSendToAgent).toHaveBeenCalledWith('ag1', {
        type: 'record:start',
        payload: {
          targetUrl: 'http://t.com',
          recordingId: validUuid,
          browserType: 'chromium',
        },
      });
    });

    it('returns 503 if agent is unavailable', async () => {
      (dbModule.db.select as any).mockReturnValue(createMockQueryBuilder([{ id: validUuid }]));
      mockSendToAgent.mockReturnValue(false);

      const res = await testApp.request(`/api/recordings/${validUuid}/start`, {
        method: 'POST',
      });
      expect(res.status).toBe(503);
    });

    it('returns 404 if recording does not exist', async () => {
      (dbModule.db.select as any).mockReturnValue(createMockQueryBuilder([]));

      const res = await testApp.request(`/api/recordings/${validUuid}/start`, {
        method: 'POST',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/recordings/:id/stop', () => {
    it('stops recording successfully', async () => {
      mockSendToAgent.mockReturnValue(true);

      const res = await testApp.request(`/api/recordings/${validUuid}/stop?agentId=ag1`, {
        method: 'POST',
      });
      expect(res.status).toBe(200);
      expect(mockSendToAgent).toHaveBeenCalledWith('ag1', {
        type: 'record:stop',
        payload: { recordingId: validUuid },
      });
    });

    it('returns 503 if agent is offline', async () => {
      mockSendToAgent.mockReturnValue(false);

      const res = await testApp.request(`/api/recordings/${validUuid}/stop`, {
        method: 'POST',
      });
      expect(res.status).toBe(503);
    });
  });

  describe('POST /api/recordings/:id/replay', () => {
    it('triggers replay successfully', async () => {
      const rec = { id: validUuid, projectId: validUuid };
      const project = { id: validUuid, replaySpeed: 'slow' };

      const findFirstMock = dbModule.db.query.recordings.findFirst as any;
      const findFirstProjMock = dbModule.db.query.projects.findFirst as any;
      findFirstMock.mockResolvedValue(rec);
      findFirstProjMock.mockResolvedValue(project);

      mockLoadActionsArtifact.mockResolvedValue(JSON.stringify({ actions: [] }));
      mockLoadMockRules.mockResolvedValue([]);
      mockSendToAgent.mockReturnValue(true);

      const res = await testApp.request(`/api/recordings/${validUuid}/replay?headless=true`, {
        method: 'POST',
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.executionId).toBeDefined();
    });

    it('returns 404 if actions artifact is missing', async () => {
      const findFirstMock = dbModule.db.query.recordings.findFirst as any;
      findFirstMock.mockResolvedValue({ id: validUuid });
      mockLoadActionsArtifact.mockResolvedValue(null);

      const res = await testApp.request(`/api/recordings/${validUuid}/replay`, {
        method: 'POST',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/recordings/batch-replay', () => {
    it('triggers batch replay successfully', async () => {
      mockLoadValidRecordings.mockResolvedValue([{ id: validUuid, title: 'Title' }]);
      mockExecuteBatchReplay.mockResolvedValue({ results: [] });

      const res = await testApp.request('/api/recordings/batch-replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordingIds: [validUuid],
          useMock: true,
        }),
      });

      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.batchId).toBeDefined();
    });

    it('returns 404 if no valid recordings found', async () => {
      mockLoadValidRecordings.mockResolvedValue([]);

      const res = await testApp.request('/api/recordings/batch-replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordingIds: [validUuid],
        }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/recordings/batch-replay/projects', () => {
    it('triggers project-based batch replay', async () => {
      (dbModule.db as any).select.mockImplementation(() => createMockQueryBuilder([{ id: validUuid }]));
      mockLoadValidRecordings.mockResolvedValue([{ id: validUuid }]);
      mockExecuteBatchReplay.mockResolvedValue({ results: [] });

      const res = await testApp.request('/api/recordings/batch-replay/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectIds: [validUuid],
        }),
      });

      expect(res.status).toBe(202);
    });

    it('returns 404 if no recordings in projects', async () => {
      (dbModule.db as any).select.mockImplementation(() => createMockQueryBuilder([]));

      const res = await testApp.request('/api/recordings/batch-replay/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectIds: [validUuid],
        }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/recordings/:id', () => {
    it('deletes recording successfully', async () => {
      mockDeleteRecording.mockResolvedValue(undefined);

      const res = await testApp.request(`/api/recordings/${validUuid}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(mockDeleteRecording).toHaveBeenCalledWith(validUuid);
    });

    it('returns 500 if delete fails', async () => {
      mockDeleteRecording.mockRejectedValue(new Error('delete failed'));

      const res = await testApp.request(`/api/recordings/${validUuid}`, {
        method: 'DELETE',
      });
      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /api/recordings/batch', () => {
    it('deletes batch of recordings successfully', async () => {
      mockDeleteRecording.mockResolvedValue(undefined);

      const res = await testApp.request('/api/recordings/batch', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: [validUuid],
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.deleted).toBe(1);
    });
  });
});
