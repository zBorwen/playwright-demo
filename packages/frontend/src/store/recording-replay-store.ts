import { create } from 'zustand';
import {
  loadAllRecordingReplayStates,
  saveRecordingReplayState,
  clearRecordingReplayState,
  type PersistedRecordingReplayState as RecordingReplayStatus,
} from '@/lib/recording-replay-storage';

interface RecordingReplayStore {
  recordingReplays: Record<string, RecordingReplayStatus>;
  setRecordingStatus: (status: Omit<RecordingReplayStatus, 'startedAt'> & { startedAt?: number }) => void;
  clearRecordingStatus: (recordingId: string) => void;
  hydrate: () => void;
}

export const useRecordingReplayStore = create<RecordingReplayStore>((set) => ({
  recordingReplays: {},

  setRecordingStatus(status) {
    const entry: RecordingReplayStatus = {
      ...status,
      startedAt: status.startedAt ?? Date.now(),
    };
    set((s) => ({
      recordingReplays: {
        ...s.recordingReplays,
        [entry.recordingId]: entry,
      },
    }));
  },

  clearRecordingStatus(recordingId) {
    set((s) => {
      const { [recordingId]: _, ...rest } = s.recordingReplays;
      return { recordingReplays: rest };
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
