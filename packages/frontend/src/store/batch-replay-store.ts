import { create } from 'zustand';
import {
  saveBatchReplayState,
  loadAllBatchReplayStates,
  clearBatchReplayState,
  type PersistedBatchReplayState,
} from '@/lib/batch-replay-storage';

export interface BatchItem {
  recordingId: string;
  recordingTitle?: string;
  executionId?: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  error?: string;
}

export interface BatchReplayState {
  batchId: string;
  scope?: string;
  projectIds?: string[];
  items: BatchItem[];
  isRunning: boolean;
  passed: number;
  failed: number;
  startedAt: number;
}

export interface BatchReplayStore {
  batches: Record<string, BatchReplayState>;
  startBatch: (batchId: string, items: BatchItem[], opts?: { scope?: string; projectIds?: string[] }) => void;
  updateItem: (batchId: string, recordingId: string, update: Partial<BatchItem>) => void;
  completeBatch: (batchId: string) => void;
  removeBatch: (batchId: string) => void;
  hydrate: () => void;
}

export const useBatchReplayStore = create<BatchReplayStore>((set) => ({
  batches: {},

  startBatch(batchId, items, opts) {
    const state: BatchReplayState = {
      batchId,
      scope: opts?.scope,
      projectIds: opts?.projectIds,
      items,
      isRunning: true,
      passed: 0,
      failed: 0,
      startedAt: Date.now(),
    };
    set(s => ({ batches: { ...s.batches, [batchId]: state } }));
  },

  updateItem(batchId, recordingId, update) {
    set(s => {
      const batch = s.batches[batchId];
      if (!batch) return s;
      const idx = batch.items.findIndex(i => i.recordingId === recordingId);
      if (idx < 0) return s;
      const updated = [...batch.items];
      updated[idx] = { ...updated[idx], ...update };
      const passed = updated.filter(i => i.status === 'passed').length;
      const failed = updated.filter(i => i.status === 'failed').length;
      const isRunning = passed + failed < updated.length;
      return {
        batches: {
          ...s.batches,
          [batchId]: { ...batch, items: updated, passed, failed, isRunning },
        },
      };
    });
  },

  completeBatch(batchId) {
    set(s => {
      const batch = s.batches[batchId];
      if (!batch) return s;
      return {
        batches: {
          ...s.batches,
          [batchId]: { ...batch, isRunning: false },
        },
      };
    });
  },

  removeBatch(batchId) {
    set(s => {
      const { [batchId]: _, ...rest } = s.batches;
      return { batches: rest };
    });
  },

  hydrate() {
    const allStates = loadAllBatchReplayStates();
    const batches: Record<string, BatchReplayState> = {};
    for (const [scope, state] of Object.entries(allStates)) {
      // Use batchId as key, but also store scope
      batches[state.batchId] = { ...state, scope };
    }
    set({ batches });
  },
}));

// Auto-persist batches to sessionStorage on every change
useBatchReplayStore.subscribe((state) => {
  for (const [batchId, batch] of Object.entries(state.batches)) {
    const persisted: PersistedBatchReplayState = {
      batchId: batch.batchId,
      scope: batch.scope,
      projectIds: batch.projectIds,
      items: batch.items,
      isRunning: batch.isRunning,
      passed: batch.passed,
      failed: batch.failed,
      startedAt: batch.startedAt,
    };
    if (batch.isRunning) {
      saveBatchReplayState(persisted, batch.scope ?? batchId);
    } else {
      clearBatchReplayState(batch.scope ?? batchId);
    }
  }
});
