import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { processReplayArtifact, processReplayDone } from '../execution-service';
import { db } from '../../db/index';

// Mock DB
vi.mock('../../db/index', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve()),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  },
}));

// Mock fs
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(() => Promise.resolve(Buffer.from('test-data'))),
}));

describe('ExecutionService', () => {
  const mockStorage = {
    saveExecutionScreenshot: vi.fn(() => Promise.resolve('server/path.jpg')),
    saveTrace: vi.fn(() => Promise.resolve('server/trace.zip')),
  } as any;

  const executionId = 'cc7eebe5-d292-47be-86b3-66f92ecf6c95';
  const recordingId = '92076e85-8f59-4671-a610-4fabbcee0ce1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processReplayArtifact', () => {
    it('processes a screenshot artifact', async () => {
      const payload = {
        executionId,
        recordingId,
        index: 2,
        type: 'screenshot' as const,
        path: path.join(os.tmpdir(), 'path.jpg'),
      };

      const result = await processReplayArtifact(mockStorage, payload);

      expect(mockStorage.saveExecutionScreenshot).toHaveBeenCalledWith(executionId, 2, expect.any(Buffer));
      expect(db.insert).toHaveBeenCalled();
      expect(result).toEqual({ serverPath: 'server/path.jpg' });
    });

    it('returns null for unknown artifact types', async () => {
      const payload = {
        executionId,
        recordingId,
        index: 2,
        type: 'unknown' as any,
        path: path.join(os.tmpdir(), 'path.dat'),
      };

      const result = await processReplayArtifact(mockStorage, payload);
      expect(result).toBeNull();
    });
  });

  describe('processReplayDone', () => {
    it('updates execution status and saves trace', async () => {
      const payload = {
        executionId,
        status: 'passed' as const,
        tracePath: path.join(os.tmpdir(), 'trace.zip'),
      };

      // Mock select for recording info
      (db.select as any).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([{ recordingId }])),
          })),
        })),
      });

      await processReplayDone(mockStorage, payload);

      expect(mockStorage.saveTrace).toHaveBeenCalled();
      expect(db.update).toHaveBeenCalled();
    });
  });
});
