import { create } from 'zustand';

export interface RecordingReplayStatus {
  recordingId: string;
  status: 'running' | 'passed' | 'failed';
  error?: string;
  executionId?: string;
}

interface RecordingReplayStore {
  recordingReplays: Record<string, RecordingReplayStatus>;
  setRecordingStatus: (status: RecordingReplayStatus) => void;
  clearRecordingStatus: (recordingId: string) => void;
  clearBatch: (recordingIds: string[]) => void;
}

export const useRecordingReplayStore = create<RecordingReplayStore>((set) => ({
  recordingReplays: {},

  setRecordingStatus(status) {
    set((s) => ({
      recordingReplays: {
        ...s.recordingReplays,
        [status.recordingId]: status,
      },
    }));
  },

  clearRecordingStatus(recordingId) {
    set((s) => {
      const { [recordingId]: _, ...rest } = s.recordingReplays;
      return { recordingReplays: rest };
    });
  },

  clearBatch(recordingIds) {
    set((s) => {
      const next = { ...s.recordingReplays };
      for (const id of recordingIds) {
        delete next[id];
      }
      return { recordingReplays: next };
    });
  },
}));
