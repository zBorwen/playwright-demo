import { create } from 'zustand';
import type { Project, Recording, Execution } from '@/lib/api';

interface AppState {
  // Projects
  projects: Project[];
  loadingProjects: boolean;
  projectError: string | null;
  setProjects: (projects: Project[]) => void;
  setLoadingProjects: (loading: boolean) => void;
  setProjectError: (error: string | null) => void;
  addProject: (project: Project) => void;

  // Recordings
  recordings: Recording[];
  loadingRecordings: boolean;
  recordingError: string | null;
  setRecordings: (recordings: Recording[]) => void;
  setLoadingRecordings: (loading: boolean) => void;
  setRecordingError: (error: string | null) => void;
  addRecording: (recording: Recording) => void;

  // Executions
  executions: Execution[];
  loadingExecutions: boolean;
  executionError: string | null;
  setExecutions: (executions: Execution[]) => void;
  setLoadingExecutions: (loading: boolean) => void;
  setExecutionError: (error: string | null) => void;
  addExecution: (execution: Execution) => void;

  // UI State
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Projects
  projects: [],
  loadingProjects: false,
  projectError: null,
  setProjects: (projects) => set({ projects }),
  setLoadingProjects: (loading) => set({ loadingProjects: loading }),
  setProjectError: (error) => set({ projectError: error }),
  addProject: (project) =>
    set((state) => ({ projects: [project, ...state.projects] })),

  // Recordings
  recordings: [],
  loadingRecordings: false,
  recordingError: null,
  setRecordings: (recordings) => set({ recordings }),
  setLoadingRecordings: (loading) => set({ loadingRecordings: loading }),
  setRecordingError: (error) => set({ recordingError: error }),
  addRecording: (recording) =>
    set((state) => ({ recordings: [recording, ...state.recordings] })),

  // Executions
  executions: [],
  loadingExecutions: false,
  executionError: null,
  setExecutions: (executions) => set({ executions }),
  setLoadingExecutions: (loading) => set({ loadingExecutions: loading }),
  setExecutionError: (error) => set({ executionError: error }),
  addExecution: (execution) =>
    set((state) => ({ executions: [execution, ...state.executions] })),

  // UI State
  selectedProjectId: null,
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),
}));
