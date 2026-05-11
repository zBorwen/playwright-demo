const STORAGE_KEY_PREFIX = 'recording-replay-state';

export interface PersistedRecordingReplayState {
  recordingId: string;
  status: 'running' | 'passed' | 'failed';
  projectId?: string;
  error?: string;
  executionId?: string;
  startedAt: number;
}

function buildKey(recordingId: string): string {
  return `${STORAGE_KEY_PREFIX}:${recordingId}`;
}

export function saveRecordingReplayState(state: PersistedRecordingReplayState): void {
  sessionStorage.setItem(buildKey(state.recordingId), JSON.stringify(state));
}

function loadRecordingReplayState(recordingId: string): PersistedRecordingReplayState | null {
  const raw = sessionStorage.getItem(buildKey(recordingId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PersistedRecordingReplayState;
  } catch {
    return null;
  }
}

export function clearRecordingReplayState(recordingId: string): void {
  sessionStorage.removeItem(buildKey(recordingId));
}

/** Scan all recording-replay-state keys and return non-stale states keyed by recordingId. */
export function loadAllRecordingReplayStates(): Record<string, PersistedRecordingReplayState> {
  const result: Record<string, PersistedRecordingReplayState> = {};
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (!key?.startsWith(STORAGE_KEY_PREFIX)) continue;
    const recordingId = key.slice(STORAGE_KEY_PREFIX.length + 1);
    const state = loadRecordingReplayState(recordingId);
    if (state && !isRecordingReplayStateStale(state)) {
      result[recordingId] = state;
    }
  }
  return result;
}

const REPLAY_STALE_THRESHOLD_MS = 30 * 60 * 1000;

function isRecordingReplayStateStale(state: PersistedRecordingReplayState): boolean {
  if (state.status !== 'running' || !state.startedAt) return false;
  return Date.now() - state.startedAt > REPLAY_STALE_THRESHOLD_MS;
}
