import { create } from 'zustand';
import { formatActionDetail } from '@/lib/action-formatter';
import type { RecordingAction } from '@playwright-demo/shared';
import type { ReplayStep } from '@/components/replay-panel';
import {
  loadAllRecordingReplayStates,
  saveRecordingReplayState,
  clearRecordingReplayState,
  type PersistedRecordingReplayState as RecordingReplayStatus,
} from '@/lib/recording-replay-storage';

interface RecordingReplayStore {
  recordingReplays: Record<string, RecordingReplayStatus>;
  /** Tracks completed step indices before initSteps is called (batch replay mid-flight). */
  stepStatuses: Record<string, Record<number, 'completed' | 'failed' | 'skipped'>>;
  /** Pending replay:done payload, applied when initSteps is called. */
  pendingDones: Record<string, { status: 'passed' | 'failed'; error?: string; executionId?: string }>;
  setRecordingStatus: (status: Omit<RecordingReplayStatus, 'startedAt' | 'finishedAt'> & { startedAt?: number; finishedAt?: number }) => void;
  /** Initialize steps for a recording. Called when component loads actions. */
  initSteps: (recordingId: string, actions: RecordingAction[]) => void;
  /** Start a new replay. Resets steps to pending, sets executionId. */
  startReplay: (recordingId: string, executionId: string, projectId?: string) => void;
  /** Handle a replay:step WS message. */
  handleReplayStep: (payload: { recordingId: string; executionId: string; index: number; status: 'completed' | 'failed'; error?: string }) => void;
  /** Handle a replay:done WS message. */
  handleReplayDone: (payload: { recordingId: string; executionId?: string; status: 'passed' | 'failed'; error?: string }) => void;
  /** Reset replay state. */
  resetReplay: (recordingId: string) => void;
  hydrate: () => void;
}

function buildSteps(actions: RecordingAction[]): ReplayStep[] {
  return actions.map((a, i) => ({
    index: i,
    actionName: a.name,
    detail: formatActionDetail(a),
    status: 'pending' as const,
  }));
}

export const useRecordingReplayStore = create<RecordingReplayStore>((set) => ({
  recordingReplays: {},
  stepStatuses: {},
  pendingDones: {},

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
        replaySteps: existing?.replaySteps,
      };
      return {
        recordingReplays: {
          ...s.recordingReplays,
          [entry.recordingId]: entry,
        },
      };
    });
  },

  initSteps(recordingId, actions) {
    set((s) => {
      const existing = s.recordingReplays[recordingId];
      const savedStatuses = s.stepStatuses[recordingId] ?? {};
      const pendingDone = s.pendingDones[recordingId];
      const steps = buildSteps(actions);

      // Apply saved step statuses (from WS messages that arrived before initSteps)
      if (Object.keys(savedStatuses).length > 0) {
        for (const [idxStr, st] of Object.entries(savedStatuses)) {
          const idx = Number(idxStr);
          if (steps[idx]) steps[idx].status = st;
        }
      }

      // Apply pending done (replay:done arrived before initSteps)
      if (pendingDone) {
        if (pendingDone.status === 'failed') {
          for (const step of steps) {
            if (step.status === 'pending') step.status = 'skipped';
          }
        } else {
          for (const step of steps) {
            if (step.status === 'pending') step.status = 'completed';
          }
        }
      }

      // Apply existing entry status if set (late init after replay completed)
      if (existing && existing.status !== 'running' && existing.status !== 'idle') {
        for (const step of steps) {
          if (step.status === 'pending') {
            step.status = existing.status === 'passed' ? 'completed' : 'skipped';
          }
        }
      }

      const updatedEntry: RecordingReplayStatus = {
        recordingId,
        status: existing?.status ?? 'idle',
        projectId: existing?.projectId,
        error: existing?.error,
        executionId: existing?.executionId,
        startedAt: existing?.startedAt ?? Date.now(),
        finishedAt: existing?.finishedAt,
        replaySteps: steps,
      };

      // Clean up tracking maps
      const newStepStatuses = { ...s.stepStatuses };
      delete newStepStatuses[recordingId];
      const newPendingDones = { ...s.pendingDones };
      delete newPendingDones[recordingId];

      return {
        recordingReplays: {
          ...s.recordingReplays,
          [recordingId]: updatedEntry,
        },
        stepStatuses: newStepStatuses,
        pendingDones: newPendingDones,
      };
    });
  },

  startReplay(recordingId, executionId, projectId) {
    set((s) => {
      const existing = s.recordingReplays[recordingId];
      const steps = (existing?.replaySteps ?? []).map(s => ({ ...s, status: 'pending' as const }));
      const entry: RecordingReplayStatus = {
        recordingId,
        status: 'running',
        projectId: projectId ?? existing?.projectId,
        error: undefined,
        executionId,
        startedAt: Date.now(),
        finishedAt: undefined,
        replaySteps: steps.length > 0 ? steps : undefined,
      };
      return {
        recordingReplays: {
          ...s.recordingReplays,
          [recordingId]: entry,
        },
        stepStatuses: {
          ...s.stepStatuses,
          [recordingId]: {},
        },
      };
    });
  },

  handleReplayStep(payload) {
    set((s) => {
      const existing = s.recordingReplays[payload.recordingId];
      const stepStatuses = s.stepStatuses[payload.recordingId] ?? {};
      stepStatuses[payload.index] = payload.status === 'failed' ? 'failed' : 'completed';

      const entry: RecordingReplayStatus = existing
        ? { ...existing }
        : {
            recordingId: payload.recordingId,
            status: 'running',
            executionId: payload.executionId,
            startedAt: Date.now(),
          };

      entry.executionId = payload.executionId;
      entry.status = 'running';
      entry.error = payload.error;

      if (entry.replaySteps) {
        const steps = [...entry.replaySteps];
        if (steps[payload.index]) {
          steps[payload.index] = {
            ...steps[payload.index],
            status: payload.status === 'failed' ? 'failed' as const : 'completed' as const,
            error: payload.error ?? steps[payload.index].error,
          };
        }
        entry.replaySteps = steps;
      }

      return {
        recordingReplays: {
          ...s.recordingReplays,
          [payload.recordingId]: entry,
        },
        stepStatuses: {
          ...s.stepStatuses,
          [payload.recordingId]: stepStatuses,
        },
      };
    });
  },

  handleReplayDone(payload) {
    set((s) => {
      const existing = s.recordingReplays[payload.recordingId];
      const entry: RecordingReplayStatus = existing
        ? { ...existing }
        : {
            recordingId: payload.recordingId,
            status: payload.status,
            executionId: payload.executionId,
            startedAt: Date.now(),
            finishedAt: Date.now(),
          };

      entry.status = payload.status;
      entry.executionId = payload.executionId ?? entry.executionId;
      entry.error = payload.error;
      entry.finishedAt = Date.now();

      if (entry.replaySteps && entry.replaySteps.length > 0) {
        entry.replaySteps = entry.replaySteps.map((step) => {
          if (step.status === 'pending') {
            return {
              ...step,
              status: payload.status === 'failed' ? 'skipped' as const : 'completed' as const,
            };
          }
          return step;
        });
      } else {
        // No steps yet — store as pending done for initSteps to apply
        const newPendingDones = { ...s.pendingDones };
        newPendingDones[payload.recordingId] = {
          status: payload.status,
          error: payload.error,
          executionId: payload.executionId,
        };
        return {
          recordingReplays: {
            ...s.recordingReplays,
            [payload.recordingId]: entry,
          },
          pendingDones: newPendingDones,
        };
      }

      return {
        recordingReplays: {
          ...s.recordingReplays,
          [payload.recordingId]: entry,
        },
      };
    });
  },

  resetReplay(recordingId) {
    set((s) => {
      const existing = s.recordingReplays[recordingId];
      if (!existing) return s;
      const entry: RecordingReplayStatus = {
        ...existing,
        status: 'idle',
        error: undefined,
        executionId: undefined,
        replaySteps: undefined,
      };
      const newStepStatuses = { ...s.stepStatuses };
      delete newStepStatuses[recordingId];
      const newPendingDones = { ...s.pendingDones };
      delete newPendingDones[recordingId];
      return {
        recordingReplays: {
          ...s.recordingReplays,
          [recordingId]: entry,
        },
        stepStatuses: newStepStatuses,
        pendingDones: newPendingDones,
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
  for (const entry of Object.values(state.recordingReplays)) {
    saveRecordingReplayState(entry);
  }
  const currentIds = new Set(Object.keys(state.recordingReplays));
  for (const prevId of Object.keys(prevState.recordingReplays)) {
    if (!currentIds.has(prevId)) {
      clearRecordingReplayState(prevId);
    }
  }
});
