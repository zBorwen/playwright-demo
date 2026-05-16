import { fork, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface PendingTask {
  type: 'task:replay' | 'task:record:start';
  id: string;
  payload: Record<string, unknown>;
}

interface WorkerInfo {
  child: ChildProcess;
  id: string;
  taskType: 'replay' | 'recording' | null;
  timer: NodeJS.Timeout | null;
}

export class WorkerPool {
  private readonly workerPath: string;
  private readonly maxWorkers: number;
  private readonly timeout: number;
  private readonly active: Map<string, WorkerInfo> = new Map();
  private readonly queue: PendingTask[] = [];
  private onMessage: ((msg: Record<string, unknown>) => void) | null = null;
  private workerCounter = 0;

  constructor(options?: { maxWorkers?: number; timeout?: number }) {
    this.maxWorkers = options?.maxWorkers ?? (Number(process.env.MAX_WORKERS) || 3);
    this.timeout = options?.timeout ?? (Number(process.env.WORKER_TIMEOUT) || 300_000);
    this.workerPath = path.join(__dirname, 'worker.js');
  }

  setOnMessage(handler: (msg: Record<string, unknown>) => void): void {
    this.onMessage = handler;
  }

  /** Submit a task. Spawns a worker immediately if a slot is free, otherwise queues. */
  submit(task: PendingTask): void {
    const freeSlot = this.findFreeSlot(task.type === 'task:replay' ? 'replay' : 'recording');
    if (freeSlot) {
      this.dispatch(freeSlot, task);
    } else {
      this.queue.push(task);
    }
  }

  /** Send a stop signal to the recording worker. */
  sendToRecording(taskType: 'task:record:stop', payload: Record<string, unknown>): void {
    const recordingWorker = this.findRecordingWorker();
    if (recordingWorker) {
      recordingWorker.child.send({ type: taskType, id: recordingWorker.id, payload });
    }
  }

  /** Force-terminate a specific worker. */
  killWorker(workerId: string): void {
    const info = this.active.get(workerId);
    if (info) {
      info.child.kill('SIGTERM');
    }
  }

  /** Gracefully shut down all workers. */
  shutdown(): void {
    for (const [, info] of this.active) {
      info.child.kill('SIGTERM');
    }
  }

  /** Number of currently busy workers. */
  get activeCount(): number {
    return this.active.size;
  }

  /** Number of queued tasks. */
  get queueLength(): number {
    return this.queue.length;
  }

  private findFreeSlot(taskType: 'replay' | 'recording'): WorkerInfo | null {
    // Recording always gets its own slot if available
    if (taskType === 'recording') {
      if (this.active.size < this.maxWorkers) {
        return this.spawn();
      }
      return null;
    }
    // Replay: check if any slot is free (not occupied by recording)
    for (const [, info] of this.active) {
      if (info.taskType === null) return info;
    }
    // Spawn new if under limit
    if (this.active.size < this.maxWorkers) {
      return this.spawn();
    }
    return null;
  }

  private findRecordingWorker(): WorkerInfo | null {
    for (const [, info] of this.active) {
      if (info.taskType === 'recording') return info;
    }
    return null;
  }

  private spawn(): WorkerInfo {
    const id = `worker-${++this.workerCounter}`;
    const child = fork(this.workerPath, [], {
      execArgv: ['--import', 'tsx'],
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, IS_WORKER: 'true' },
    });

    const info: WorkerInfo = { child, id, taskType: null, timer: null };
    this.active.set(id, info);

    // Forward stderr with prefix
    child.stderr?.on('data', (data: Buffer) => {
      process.stderr.write(`[${id}] ${data}`);
    });

    child.stdout?.on('data', (data: Buffer) => {
      process.stdout.write(`[${id}] ${data}`);
    });

    child.on('message', (msg: unknown) => {
      this.handleMessage(id, msg as Record<string, unknown>);
    });

    child.on('exit', (code, signal) => {
      this.handleExit(id, code, signal);
    });

    return info;
  }

  private dispatch(worker: WorkerInfo, task: PendingTask): void {
    worker.taskType = task.type === 'task:replay' ? 'replay' : 'recording';

    // Set timeout timer
    worker.timer = setTimeout(() => {
      console.log(`[${worker.id}] task timed out, killing worker`);
      worker.child.kill('SIGKILL');
      if (this.onMessage) {
        this.onMessage({
          type: task.type === 'task:replay' ? 'replay:done' : 'record:complete',
          payload: {
            ...(task.payload as Record<string, unknown>),
            status: 'failed',
            error: 'Worker timed out',
          },
        });
      }
    }, this.timeout);

    worker.child.send({ type: task.type, id: task.id, payload: task.payload });
  }

  private handleMessage(workerId: string, msg: Record<string, unknown>): void {
    const info = this.active.get(workerId);
    if (!info) return;

    switch (msg.type as string) {
      case 'worker:ready':
        // Worker is ready to receive tasks
        break;

      case 'replay:step':
      case 'replay:step:failed':
      case 'replay:done':
      case 'record:action':
      case 'record:complete':
      case 'error':
        // Forward to manager (which sends to server via WebSocket)
        if (this.onMessage) {
          this.onMessage(msg);
        }
        break;

      default:
        console.warn(`[${workerId}] unknown message type: ${msg.type}`);
    }
  }

  private handleExit(workerId: string, code: number | null, signal: string | null): void {
    const info = this.active.get(workerId);
    if (!info) return;

    // Clear timeout timer
    if (info.timer) clearTimeout(info.timer);

    const wasRecording = info.taskType === 'recording';
    const wasReplay = info.taskType === 'replay';

    // If worker exited abnormally, send failure
    if (code !== 0 && code !== null && this.onMessage) {
      if (wasReplay) {
        // We don't have executionId here, but the worker should have sent error before exit
      }
    }

    this.active.delete(workerId);

    // Drain next task from queue
    const next = this.queue.shift();
    if (next) {
      const newWorker = this.spawn();
      this.dispatch(newWorker, next);
    }
  }
}
