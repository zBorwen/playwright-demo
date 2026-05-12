import { create } from 'zustand';
import {
  loadAllRecordingReplayStates,
  saveRecordingReplayState,
  clearRecordingReplayState,
  type PersistedRecordingReplayState as RecordingReplayStatus,
} from '@/lib/recording-replay-storage';

interface RecordingReplayStore {
  recordingReplays: Record<string, RecordingReplayStatus>;
  setRecordingStatus: (status: Omit<RecordingReplayStatus, 'startedAt' | 'finishedAt'> & { startedAt?: number; finishedAt?: number }) => void;
  hydrate: () => void;
}

export const useRecordingReplayStore = create<RecordingReplayStore>((set) => ({
  recordingReplays: {},

  setRecordingStatus(status) {
    set((s) => {
      const existing = s.recordingReplays[status.recordingId];
      const entry: RecordingReplayStatus = {
        recordingId: status.recordingId,
        status: status.status,
        projectId: status.projectId ?? existing?.projectId,
        error: status.error ?? existing?.error,
        executionId: status.executionId ?? existing?.executionId,
        startedAt: status.startedAt ?? existing?.startedAt ?? Date.now(),
        finishedAt: status.finishedAt ?? (status.status !== 'running' ? Date.now() : existing?.finishedAt),
      };
      return {
        recordingReplays: {
          ...s.recordingReplays,
          [entry.recordingId]: entry,
        },
      };
    });
  },

  hydrate() {
    const states = loadAllRecordingReplayStates();
    set({ recordingReplays: states });
  },
}));

// Auto-persist: when store changes, save all entries and clear removed ones
useRecordingReplayStore.subscribe((state, prevState) => {
  // Save changed entries
  for (const entry of Object.values(state.recordingReplays)) {
    saveRecordingReplayState(entry);
  }
  // Clear removed entries
  const currentIds = new Set(Object.keys(state.recordingReplays));
  for (const prevId of Object.keys(prevState.recordingReplays)) {
    if (!currentIds.has(prevId)) {
      clearRecordingReplayState(prevId);
    }
  }
});
