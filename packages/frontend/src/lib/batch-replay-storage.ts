const STORAGE_KEY_PREFIX = 'batch-replay-state';

export interface PersistedBatchReplayState {
  batchId: string;
  scope?: string;
  items: Array<{
    recordingId: string;
    recordingTitle?: string;
    executionId?: string;
    status: 'pending' | 'running' | 'passed' | 'failed';
    error?: string;
  }>;
  /** For cross-project batches: which projectIds are included */
  projectIds?: string[];
  isRunning: boolean;
  passed: number;
  failed: number;
  startedAt: number;
}

function buildKey(scope?: string): string {
  return scope ? `${STORAGE_KEY_PREFIX}:${scope}` : STORAGE_KEY_PREFIX;
}

export function saveBatchReplayState(state: PersistedBatchReplayState, scope?: string): void {
  sessionStorage.setItem(buildKey(scope), JSON.stringify(state));
}

export function loadBatchReplayState(scope?: string): PersistedBatchReplayState | null {
  const raw = sessionStorage.getItem(buildKey(scope));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedBatchReplayState;
  } catch {
    return null;
  }
}

export function clearBatchReplayState(scope?: string): void {
  sessionStorage.removeItem(buildKey(scope));
}

/** Scan all batch-replay-state keys and return non-stale states keyed by scope. */
export function loadAllBatchReplayStates(): Record<string, PersistedBatchReplayState> {
  const result: Record<string, PersistedBatchReplayState> = {};
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(STORAGE_KEY_PREFIX)) {
      const scope = key.slice(STORAGE_KEY_PREFIX.length + 1);
      const state = loadBatchReplayState(scope || undefined);
      if (state && !isBatchReplayStateStale(state)) {
        result[scope] = state;
      }
    }
  }
  return result;
}

const BATCH_STALE_THRESHOLD_MS = 30 * 60 * 1000;

export function isBatchReplayStateStale(state: PersistedBatchReplayState): boolean {
  return state.isRunning && (Date.now() - state.startedAt > BATCH_STALE_THRESHOLD_MS);
}
