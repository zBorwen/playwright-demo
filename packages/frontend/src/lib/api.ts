const API_BASE = import.meta.env.VITE_API_URL || '/api';

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Recording {
  id: string;
  projectId: string;
  title: string;
  targetUrl?: string;
  createdAt: string;
  updatedAt: string;
}

function ensureOk(res: Response): void {
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/projects`);
  ensureOk(res);
  return res.json() as Promise<Project[]>;
}

export async function createProject(data: { name: string; description?: string }): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  ensureOk(res);
  return res.json() as Promise<Project>;
}

export async function fetchRecordings(projectId?: string): Promise<Recording[]> {
  const url = projectId
    ? `${API_BASE}/recordings?projectId=${projectId}`
    : `${API_BASE}/recordings`;
  const res = await fetch(url);
  ensureOk(res);
  return res.json() as Promise<Recording[]>;
}
