import type { Execution } from '@/lib/api';
import type { RecordingAction } from '@playwright-demo/shared';
import { formatActionDetail } from '@/lib/action-formatter';

const STALE_THRESHOLD_MS = 5 * 60 * 1000;

interface RunningExecution {
  executionId: string;
  steps: Array<{
    index: number;
    actionName: string;
    detail: string;
    status: 'pending';
  }>;
}

export function detectRunningExecution(
  executions: Execution[],
  actions: RecordingAction[],
): RunningExecution | null {
  const latest = executions[0];
  if (!latest || latest.status !== 'running') return null;

  const startedMs = new Date(latest.startedAt).getTime();
  if (Date.now() - startedMs > STALE_THRESHOLD_MS) return null;

  const steps = actions.map((a, i) => ({
    index: i,
    actionName: a.name,
    detail: formatActionDetail(a),
    status: 'pending' as const,
  }));

  return { executionId: latest.id, steps };
}
