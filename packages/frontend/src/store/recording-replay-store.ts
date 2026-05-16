import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { formatActionDetail } from '@/lib/action-formatter';
import type { RecordingAction, ReplayStep } from '@playwright-demo/shared';
import {
  loadAllRecordingReplayStates,
  saveRecordingReplayState,
  clearRecordingReplayState,
  type PersistedRecordingReplayState as RecordingReplayStatus,
} from '@/lib/recording-replay-storage';

interface RecordingReplayStore {
  recordingReplays: Record<string, RecordingReplayStatus>;
  /** Tracks completed step indices before startReplay is called (batch replay mid-flight). */
  stepStatuses: Record<string, Record<number, 'completed' | 'failed' | 'skipped'>>;
  /** Pending replay:done payload, applied when startReplay is called. */
  pendingDones: Record<string, { status: 'passed' | 'failed'; error?: string; executionId?: string }>;
  
  // Recording State
  activeRecordingActions: Record<string, RecordingAction[]>;
  activeCodegens: Record<string, string>;

  setRecordingStatus: (status: Omit<RecordingReplayStatus, 'startedAt' | 'finishedAt'> & { startedAt?: number; finishedAt?: number }) => void;
  /** Build step skeleton from actions. Called when component mounts. Merges with WS state from batch replay. */
  initSteps: (recordingId: string, actions: RecordingAction[]) => void;
  /** Start a new replay from detail page. Atomically resets state and rebuilds steps from actions. */
  startReplay: (recordingId: string, executionId: string, actions: RecordingAction[], projectId?: string) => void;
  /** Handle a replay:step WS message. */
  handleReplayStep: (payload: { recordingId: string; executionId: string; index: number; status: 'completed' | 'failed'; error?: string }) => void;
  /** Handle a replay:artifact WS message. */
  handleReplayArtifact: (payload: { recordingId: string; executionId: string; index: number; type: 'screenshot' | 'har' | 'trace'; path: string }) => void;
  /** Handle a replay:done WS message. */
  handleReplayDone: (payload: { recordingId: string; executionId?: string; status: 'passed' | 'failed'; error?: string }) => void;
  /** Reset replay state. */
  resetReplay: (recordingId: string) => void;
  hydrate: () => void;

  // Recording Actions
  setActions: (recordingId: string, actions: RecordingAction[]) => void;
  appendAction: (recordingId: string, action: RecordingAction) => void;
  updateLastAction: (recordingId: string, action: RecordingAction) => void;
  setCodegen: (recordingId: string, codegen: string) => void;
  appendCodegen: (recordingId: string, code: string) => void;
  clearRecordingState: (recordingId: string) => void;
}

function buildSteps(actions: RecordingAction[]): ReplayStep[] {
  return actions.map((a, i) => ({
    index: i,
    actionName: a.name,
    detail: formatActionDetail(a),
    status: 'pending' as const,
  }));
}

export const useRecordingReplayStore = create<RecordingReplayStore>()(
  immer((set) => ({
    recordingReplays: {},
    stepStatuses: {},
    pendingDones: {},
    activeRecordingActions: {},
    activeCodegens: {},

    setRecordingStatus: (status) => set((state) => {
      const existing = state.recordingReplays[status.recordingId];
      if (existing) {
        const isNewExecution = status.executionId && status.executionId !== existing.executionId;

        existing.status = status.status;
        if (status.projectId !== undefined) existing.projectId = status.projectId;
        if (status.error !== undefined) existing.error = status.error;
        if (status.executionId !== undefined) existing.executionId = status.executionId;
        if (status.startedAt !== undefined) existing.startedAt = status.startedAt;
        if (status.finishedAt !== undefined) existing.finishedAt = status.finishedAt;

        if (isNewExecution && existing.replaySteps) {
          for (const step of existing.replaySteps) {
            step.status = 'pending';
            step.error = undefined;
          }
          state.stepStatuses[status.recordingId] = {};
          if (state.pendingDones[status.recordingId]) {
            delete state.pendingDones[status.recordingId];
          }
        }
      } else {
        state.recordingReplays[status.recordingId] = {
          recordingId: status.recordingId,
          status: status.status,
          projectId: status.projectId,
          error: status.error,
          executionId: status.executionId,
          startedAt: status.startedAt ?? Date.now(),
          finishedAt: status.finishedAt,
          replaySteps: undefined,
        };
      }
    }),

    initSteps: (recordingId, actions) => set((state) => {
      let existing = state.recordingReplays[recordingId];
      const savedStatuses = state.stepStatuses[recordingId] ?? {};
      const pendingDone = state.pendingDones[recordingId];

      const steps = buildSteps(actions);

      if (existing && existing.replaySteps) {
        for (let i = 0; i < steps.length; i++) {
          if (existing.replaySteps[i] && existing.replaySteps[i].status !== 'pending') {
            steps[i].status = existing.replaySteps[i].status;
            steps[i].error = existing.replaySteps[i].error;
          }
        }
      }

      if (Object.keys(savedStatuses).length > 0) {
        for (const [idxStr, st] of Object.entries(savedStatuses)) {
          const idx = Number(idxStr);
          if (steps[idx]) steps[idx].status = st;
        }
      }

      if (pendingDone) {
        for (const step of steps) {
          if (step.status === 'pending') {
            step.status = pendingDone.status === 'failed' ? 'skipped' : 'completed';
          }
        }
      }

      if (existing && existing.status !== 'running' && existing.status !== 'idle') {
        for (const step of steps) {
          if (step.status === 'pending') {
            step.status = existing.status === 'passed' ? 'completed' : 'skipped';
          }
        }
      }

      if (existing) {
        existing.replaySteps = steps;
      } else {
        state.recordingReplays[recordingId] = {
          recordingId,
          status: 'idle',
          startedAt: Date.now(),
          replaySteps: steps,
        };
      }

      delete state.stepStatuses[recordingId];
      delete state.pendingDones[recordingId];
    }),

    startReplay: (recordingId, executionId, actions, projectId) => set((state) => {
      let existing = state.recordingReplays[recordingId];
      const savedStatuses = state.stepStatuses[recordingId] ?? {};
      const pendingDone = state.pendingDones[recordingId];

      const steps = buildSteps(actions);

      if (Object.keys(savedStatuses).length > 0) {
        for (const [idxStr, st] of Object.entries(savedStatuses)) {
          const idx = Number(idxStr);
          if (steps[idx]) steps[idx].status = st;
        }
      }

      if (pendingDone) {
        for (const step of steps) {
          if (step.status === 'pending') {
            step.status = pendingDone.status === 'failed' ? 'skipped' : 'completed';
          }
        }
      }

      if (existing) {
        existing.status = 'running';
        existing.executionId = executionId;
        existing.startedAt = Date.now();
        existing.finishedAt = undefined;
        existing.error = undefined;
        existing.replaySteps = steps;
        if (projectId) existing.projectId = projectId;
      } else {
        state.recordingReplays[recordingId] = {
          recordingId,
          status: 'running',
          projectId,
          executionId,
          startedAt: Date.now(),
          replaySteps: steps,
        };
      }

      delete state.stepStatuses[recordingId];
      delete state.pendingDones[recordingId];
    }),

    handleReplayStep: (payload) => set((state) => {
      const existing = state.recordingReplays[payload.recordingId];
      
      // Handle new execution started via WS before UI calls startReplay
      if (existing && existing.executionId && existing.executionId !== payload.executionId) {
        existing.executionId = payload.executionId;
        existing.status = 'running';
        existing.error = undefined;
        existing.finishedAt = undefined;
        existing.startedAt = Date.now();
        if (existing.replaySteps) {
          for (const step of existing.replaySteps) {
            step.status = 'pending';
            step.error = undefined;
          }
        }
        state.stepStatuses[payload.recordingId] = {};
        if (state.pendingDones[payload.recordingId]) {
          delete state.pendingDones[payload.recordingId];
        }
      }

      if (!state.stepStatuses[payload.recordingId]) {
        state.stepStatuses[payload.recordingId] = {};
      }
      state.stepStatuses[payload.recordingId][payload.index] = payload.status === 'failed' ? 'failed' : 'completed';

      if (!existing) {
        state.recordingReplays[payload.recordingId] = {
          recordingId: payload.recordingId,
          status: 'running',
          executionId: payload.executionId,
          startedAt: Date.now(),
        };
      } else {
        existing.status = 'running';
        if (payload.error) existing.error = payload.error;
        if (existing.replaySteps && existing.replaySteps[payload.index]) {
          existing.replaySteps[payload.index].status = payload.status === 'failed' ? 'failed' : 'completed';
          if (payload.error) existing.replaySteps[payload.index].error = payload.error;
        }
      }
    }),

    handleReplayArtifact: (payload) => set((state) => {
      const existing = state.recordingReplays[payload.recordingId];
      
      // Detect stale message
      if (existing && existing.executionId && existing.executionId !== payload.executionId) {
        return;
      }

      if (existing && existing.replaySteps && existing.replaySteps[payload.index]) {
        if (payload.type === 'screenshot') {
          existing.replaySteps[payload.index].screenshot = payload.path;
        }
      }
    }),

    handleReplayDone: (payload) => set((state) => {
      const existing = state.recordingReplays[payload.recordingId];
      const finishedAt = Date.now();

      if (!existing) {
        state.pendingDones[payload.recordingId] = {
          status: payload.status,
          error: payload.error,
          executionId: payload.executionId,
        };
        state.recordingReplays[payload.recordingId] = {
          recordingId: payload.recordingId,
          status: payload.status,
          executionId: payload.executionId,
          startedAt: Date.now(),
          finishedAt,
        };
        return;
      }

      existing.status = payload.status;
      if (payload.error) existing.error = payload.error;
      existing.finishedAt = finishedAt;

      if (existing.replaySteps && existing.replaySteps.length > 0) {
        for (const step of existing.replaySteps) {
          if (step.status === 'pending') {
            step.status = payload.status === 'failed' ? 'skipped' : 'completed';
          }
        }
      } else {
        state.pendingDones[payload.recordingId] = {
          status: payload.status,
          error: payload.error,
          executionId: payload.executionId,
        };
      }
    }),

    resetReplay: (recordingId) => set((state) => {
      const existing = state.recordingReplays[recordingId];
      if (existing) {
        existing.status = 'idle';
        existing.error = undefined;
        existing.executionId = undefined;
        existing.replaySteps = undefined;
      }
      delete state.stepStatuses[recordingId];
      delete state.pendingDones[recordingId];
    }),

    hydrate: () => set((state) => {
      const states = loadAllRecordingReplayStates();
      state.recordingReplays = states;
    }),

    // Recording Actions
    setActions: (recordingId, actions) => set((state) => {
      state.activeRecordingActions[recordingId] = actions;
    }),
    
    appendAction: (recordingId, action) => set((state) => {
      if (!state.activeRecordingActions[recordingId]) {
        state.activeRecordingActions[recordingId] = [];
      }
      state.activeRecordingActions[recordingId].push(action);
    }),

    updateLastAction: (recordingId, action) => set((state) => {
      const actions = state.activeRecordingActions[recordingId];
      if (actions && actions.length > 0) {
        actions[actions.length - 1] = action;
      } else {
        state.activeRecordingActions[recordingId] = [action];
      }
    }),

    setCodegen: (recordingId, codegen) => set((state) => {
      state.activeCodegens[recordingId] = codegen;
    }),

    appendCodegen: (recordingId, code) => set((state) => {
      if (state.activeCodegens[recordingId]) {
        state.activeCodegens[recordingId] += '\n' + code;
      } else {
        state.activeCodegens[recordingId] = code;
      }
    }),

    clearRecordingState: (recordingId) => set((state) => {
      delete state.activeRecordingActions[recordingId];
      delete state.activeCodegens[recordingId];
    }),
  }))
);

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
