import type { Execution } from '@/lib/api';
import type { RecordingAction } from '@playwright-demo/shared';

const STALE_THRESHOLD_MS = 5 * 60 * 1000;

export interface RunningExecution {
  executionId: string;
  steps: Array<{
    index: number;
    actionName: string;
    detail: string;
    status: 'pending';
  }>;
}

function formatActionDetail(action: RecordingAction): string {
  const parts: string[] = [];
  if ('selector' in action && action.selector) parts.push(action.selector as string);
  if ('value' in action && action.value) parts.push(String(action.value));
  if ('key' in action && action.key) parts.push(action.key);
  if ('text' in action && action.text) parts.push(`"${action.text}"`);
  return parts.join(' ');
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
