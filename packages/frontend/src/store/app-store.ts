import { create } from 'zustand';
import type { Project } from '@/lib/api';

interface AppState {
  projects: Project[];
  loadingProjects: boolean;
  projectError: string | null;
  setProjects: (projects: Project[]) => void;
  setLoadingProjects: (loading: boolean) => void;
  setProjectError: (error: string | null) => void;
  addProject: (project: Project) => void;
}

export const useAppStore = create<AppState>((set) => ({
  projects: [],
  loadingProjects: false,
  projectError: null,
  setProjects: (projects) => set({ projects }),
  setLoadingProjects: (loading) => set({ loadingProjects: loading }),
  setProjectError: (error) => set({ projectError: error }),
  addProject: (project) =>
    set((state) => ({ projects: [project, ...state.projects] })),
}));
