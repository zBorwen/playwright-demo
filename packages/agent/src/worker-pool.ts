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
  currentTask: PendingTask | null;
  timer: NodeJS.Timeout | null;
}

export class WorkerPool {
  private readonly workerPath: string;
  private readonly maxWorkers: number;
  private readonly timeout: number;
  /** Key is taskId (recordingId or executionId) */
  private readonly active: Map<string, WorkerInfo> = new Map();
  private readonly queue: PendingTask[] = [];
  private onMessage: ((msg: Record<string, unknown>) => void) | null = null;

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
    if (this.active.size < this.maxWorkers) {
      this.spawnAndDispatch(task);
    } else {
      this.queue.push(task);
    }
  }

  /** Send a message to a specific worker by its task ID. */
  sendToTask(taskId: string, type: string, payload: Record<string, unknown>): boolean {
    const info = this.active.get(taskId);
    if (info) {
      info.child.send({ type, id: taskId, payload });
      return true;
    }
    return false;
  }

  /** Send a stop signal to the recording worker. */
  sendToRecording(taskType: 'task:record:stop', payload: Record<string, any>): void {
    // Precise routing by recordingId
    this.sendToTask(payload.recordingId, taskType, payload);
  }

  /** Force-terminate a specific task. */
  killTask(taskId: string): void {
    const info = this.active.get(taskId);
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

  private spawnAndDispatch(task: PendingTask): void {
    const taskId = task.id;
    const child = fork(this.workerPath, [], {
      execArgv: ['--import', 'tsx'],
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, IS_WORKER: 'true' },
    });

    const info: WorkerInfo = {
      child,
      id: taskId,
      taskType: task.type === 'task:replay' ? 'replay' : 'recording',
      currentTask: task,
      timer: null
    };

    this.active.set(taskId, info);

    // Forward stderr/stdout
    child.stderr?.on('data', (data: Buffer) => process.stderr.write(`[${taskId}] ${data}`));
    child.stdout?.on('data', (data: Buffer) => process.stdout.write(`[${taskId}] ${data}`));

    child.on('message', (msg: any) => {
      if (this.onMessage) this.onMessage(msg);
    });

    child.on('exit', (code, signal) => {
      this.handleExit(taskId, code, signal);
    });

    // Set timeout
    info.timer = setTimeout(() => {
      console.log(`[${taskId}] Task timed out, killing worker`);
      child.kill('SIGKILL');
    }, this.timeout);

    // Initial dispatch
    child.send({ type: task.type, id: taskId, payload: task.payload });
  }

  private handleExit(taskId: string, code: number | null, signal: string | null): void {
    const info = this.active.get(taskId);
    if (!info) return;

    if (info.timer) clearTimeout(info.timer);

    const task = info.currentTask;
    if (code !== 0 && code !== null && this.onMessage && task) {
      const errorMsg = signal ? `Worker killed by signal ${signal}` : `Worker exited with code ${code}`;
      console.error(`[${taskId}] Abnormal exit: ${errorMsg}`);

      if (info.taskType === 'replay') {
        this.onMessage({
          type: 'replay:done',
          payload: {
            executionId: taskId,
            recordingId: (task.payload as any).recordingId,
            status: 'failed',
            error: errorMsg,
          },
        });
      } else {
        this.onMessage({
          type: 'record:complete',
          payload: { recordingId: taskId, error: errorMsg },
        });
      }
    }

    this.active.delete(taskId);

    // Process queue
    const next = this.queue.shift();
    if (next) this.spawnAndDispatch(next);
  }
}
