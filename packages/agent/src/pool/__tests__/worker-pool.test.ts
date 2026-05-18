import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkerPool } from '../worker-pool';
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

describe('WorkerPool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits a task and spawns a worker', () => {
    const pool = new WorkerPool({ maxWorkers: 2 });
    const task = { type: 'task:replay' as const, id: 'test-id', payload: {} };
    
    pool.submit(task);
    
    expect(fork).toHaveBeenCalled();
    expect(pool.activeCount).toBe(1);
  });

  it('queues tasks when max workers reached', () => {
    const pool = new WorkerPool({ maxWorkers: 1 });
    pool.submit({ type: 'task:replay' as const, id: 't1', payload: {} });
    pool.submit({ type: 'task:replay' as const, id: 't2', payload: {} });
    
    expect(fork).toHaveBeenCalledTimes(1);
    expect(pool.activeCount).toBe(1);
    expect(pool.queueLength).toBe(1);
  });

  it('terminates all workers on shutdown', () => {
    const pool = new WorkerPool();
    pool.submit({ type: 'task:replay' as const, id: 't1', payload: {} });
    
    const mockWorker = (fork as any).mock.results[0].value;
    pool.shutdown();
    
    expect(mockWorker.kill).toHaveBeenCalledWith('SIGTERM');
  });
});
