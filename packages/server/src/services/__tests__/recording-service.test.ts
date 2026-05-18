import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processRecordingComplete } from '../recording-service';
import { db } from '../../db/index';

// Mock DB
vi.mock('../../db/index', () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve()),
    })),
    query: {
      recordings: {
        findFirst: vi.fn(() => Promise.resolve({
          id: '92076e85-8f59-4671-a610-4fabbcee0ce1',
          title: 'Test',
          targetUrl: 'http://example.com',
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      },
    },
  },
  recordings: { id: {} },
  recordingArtifacts: { recordingId: {}, type: {} },
}));

// Mock storage
const mockStorage = {
  saveHar: vi.fn(() => Promise.resolve('har/path')),
  saveRecording: vi.fn(() => Promise.resolve('actions/path')),
} as any;

// Mock fs
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(() => Promise.resolve(Buffer.from('test-data'))),
}));

// Mock har-filter
vi.mock('../har-filter', () => ({
  parseAndFilterHar: vi.fn(() => Promise.resolve([])),
}));

describe('RecordingService', () => {
  const recordingId = '92076e85-8f59-4671-a610-4fabbcee0ce1';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes recording completion without HAR', async () => {
    const payload = {
      recordingId,
      actions: [],
    };

    await processRecordingComplete(mockStorage, payload);

    expect(db.update).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled(); // For actions artifact
    expect(mockStorage.saveRecording).toHaveBeenCalled();
  });

  it('processes recording completion with HAR', async () => {
    const payload = {
      recordingId,
      actions: [],
      harPath: '/tmp/test.har',
    };

    await processRecordingComplete(mockStorage, payload);

    expect(mockStorage.saveHar).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalledTimes(2); // actions + har artifacts
  });
});
