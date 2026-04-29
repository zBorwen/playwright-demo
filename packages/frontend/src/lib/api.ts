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

export async function fetchRecording(id: string): Promise<Recording> {
  const res = await fetch(`${API_BASE}/recordings/${id}`);
  ensureOk(res);
  return res.json() as Promise<Recording>;
}

export async function fetchRecordingActions(id: string): Promise<{ actions: Action[] }> {
  const res = await fetch(`${API_BASE}/recordings/${id}/actions`);
  ensureOk(res);
  return res.json();
}

export async function startRecording(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/recordings/${id}/start`, { method: 'POST' });
  ensureOk(res);
  return res.json();
}

export async function stopRecording(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/recordings/${id}/stop`, { method: 'POST' });
  ensureOk(res);
  return res.json();
}

export async function replayRecording(id: string): Promise<{ ok: boolean; executionId: string }> {
  const res = await fetch(`${API_BASE}/recordings/${id}/replay`, { method: 'POST' });
  ensureOk(res);
  return res.json();
}

export interface Action {
  name: string;
  selector?: string;
  url?: string;
  text?: string;
}

export interface Execution {
  id: string;
  recordingId: string;
  status: 'running' | 'passed' | 'failed';
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

export async function fetchExecutions(recordingId: string): Promise<Execution[]> {
  const res = await fetch(`${API_BASE}/executions?recordingId=${recordingId}`);
  ensureOk(res);
  return res.json() as Promise<Execution[]>;
}
