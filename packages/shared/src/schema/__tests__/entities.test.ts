import { describe, it, expect } from 'vitest';
import { ProjectSchema, RecordingSchema, ExecutionSchema } from '../entities.js';

describe('Entity Schemas', () => {
  it('validates a valid Project', () => {
    const data = {
      id: '92076e85-8f59-4671-a610-4fabbcee0ce1',
      name: 'Test Project',
      replaySpeed: 'normal',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(ProjectSchema.safeParse(data).success).toBe(true);
  });

  it('validates a valid Recording', () => {
    const data = {
      id: '92076e85-8f59-4671-a610-4fabbcee0ce1',
      projectId: 'cc7eebe5-d292-47be-86b3-66f92ecf6c95',
      title: 'My Recording',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(RecordingSchema.safeParse(data).success).toBe(true);
  });

  it('validates a valid Execution', () => {
    const data = {
      id: '92076e85-8f59-4671-a610-4fabbcee0ce1',
      recordingId: 'cc7eebe5-d292-47be-86b3-66f92ecf6c95',
      status: 'passed',
      startedAt: new Date().toISOString(),
    };
    expect(ExecutionSchema.safeParse(data).success).toBe(true);
  });

  it('rejects invalid UUID', () => {
    const data = {
      id: 'invalid-uuid',
      name: 'Bad Project',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(ProjectSchema.safeParse(data).success).toBe(false);
  });
});
