import { create } from 'zustand';
import {
  loadAllRecordingReplayStates,
  saveRecordingReplayState,
  clearRecordingReplayState,
  type PersistedRecordingReplayState,
} from '@/lib/batch-replay-storage';

export interface RecordingReplayStatus {
  recordingId: string;
  status: 'running' | 'passed' | 'failed';
  projectId?: string;
  error?: string;
  executionId?: string;
  startedAt: number;
}

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
    saveRecordingReplayState(entry as PersistedRecordingReplayState);
  },

  clearRecordingStatus(recordingId) {
    set((s) => {
      const { [recordingId]: _, ...rest } = s.recordingReplays;
      return { recordingReplays: rest };
    });
    clearRecordingReplayState(recordingId);
  },

  hydrate() {
    const states = loadAllRecordingReplayStates();
    set({ recordingReplays: states });
  },
}));

// Auto-persist: when store changes, save all entries
useRecordingReplayStore.subscribe((state) => {
  for (const entry of Object.values(state.recordingReplays)) {
    saveRecordingReplayState(entry as PersistedRecordingReplayState);
  }
});
