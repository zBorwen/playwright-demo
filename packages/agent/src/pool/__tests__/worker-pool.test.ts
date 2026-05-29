import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerPool } from '../worker-pool';
import type { TaskReplayPayload } from '../../types/tasks';
import { fork } from 'node:child_process';

vi.mock('node:child_process', () => ({
  fork: vi.fn(() => ({
    on: vi.fn(),
    send: vi.fn(),
    kill: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
  })),
}));

const makeReplayPayload = (overrides?: Partial<TaskReplayPayload>): TaskReplayPayload => ({
  executionId: 'exec-1',
  recordingId: 'rec-1',
  actions: [],
  mockRules: [],
  headless: true,
  browserType: 'chromium',
  stepDelay: 300,
  useMock: false,
  ...overrides,
});

const makeReplayTask = (id: string) => ({ type: 'task:replay' as const, id, payload: makeReplayPayload() });

describe('WorkerPool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('提交任务并创建 Worker', () => {
    const pool = new WorkerPool({ maxWorkers: 2 });
    pool.submit(makeReplayTask('test-id'));

    expect(fork).toHaveBeenCalled();
    expect(pool.activeCount).toBe(1);
  });

  it('Worker 数量达到上限时排队', () => {
    const pool = new WorkerPool({ maxWorkers: 1 });
    pool.submit(makeReplayTask('t1'));
    pool.submit(makeReplayTask('t2'));

    expect(fork).toHaveBeenCalledTimes(1);
    expect(pool.activeCount).toBe(1);
    expect(pool.queueLength).toBe(1);
  });

  it('shutdown 终止所有 Worker', () => {
    const pool = new WorkerPool();
    pool.submit(makeReplayTask('t1'));

    const mockWorker = (fork as unknown as { mock: { results: { value: { kill: ReturnType<typeof vi.fn> } }[] } }).mock.results[0].value;
    pool.shutdown();

    expect(mockWorker.kill).toHaveBeenCalledWith('SIGTERM');
  });
});
