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

export async function createRecording(data: { projectId: string; title: string; targetUrl?: string }): Promise<Recording> {
  const res = await fetch(`${API_BASE}/recordings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  ensureOk(res);
  return res.json() as Promise<Recording>;
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

export async function fetchRecordingActions(id: string): Promise<{ actions: RecordingAction[] }> {
  const res = await fetch(`${API_BASE}/recordings/${id}/actions`);
  ensureOk(res);
  return res.json();
}

export async function fetchRecordingCodegen(id: string): Promise<{ codegen: string }> {
  const res = await fetch(`${API_BASE}/recordings/${id}/codegen`);
  ensureOk(res);
  return res.json();
}

export async function saveRecordingActions(id: string, actions: RecordingAction[]): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/recordings/${id}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actions }),
  });
  ensureOk(res);
  return res.json();
}

import type { RecordingAction, NetworkEntry, MockRule } from '@playwright-demo/shared';
export type { RecordingAction, NetworkEntry, MockRule };

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

export async function replayRecording(id: string, options?: { useMock?: boolean }): Promise<{ ok: boolean; executionId: string }> {
  const params = options?.useMock ? '?mock=true' : '';
  const res = await fetch(`${API_BASE}/recordings/${id}/replay${params}`, { method: 'POST' });
  ensureOk(res);
  return res.json();
}

export interface Execution {
  id: string;
  recordingId: string;
  status: 'running' | 'passed' | 'failed';
  startedAt: string;
  finishedAt?: string;
  error?: string;
}

export interface ExecutionArtifact {
  id: string;
  executionId: string;
  type: 'screenshot' | 'har';
  path: string;
  stepIndex?: number;
}

export async function fetchExecutionArtifacts(id: string): Promise<ExecutionArtifact[]> {
  const res = await fetch(`${API_BASE}/executions/${id}/artifacts`);
  ensureOk(res);
  return res.json() as Promise<ExecutionArtifact[]>;
}

export async function fetchExecutions(recordingId: string): Promise<Execution[]> {
  const res = await fetch(`${API_BASE}/executions?recordingId=${recordingId}`);
  ensureOk(res);
  return res.json() as Promise<Execution[]>;
}

export async function fetchExecution(id: string): Promise<Execution> {
  const res = await fetch(`${API_BASE}/executions/${id}`);
  ensureOk(res);
  return res.json() as Promise<Execution>;
}

// ─── Network & Mock Rules ─────────────────────────────────────

export async function fetchRecordingNetwork(id: string): Promise<{ entries: NetworkEntry[] }> {
  const res = await fetch(`${API_BASE}/recordings/${id}/network`);
  ensureOk(res);
  return res.json();
}

export async function fetchRecordingMockRules(id: string): Promise<{ rules: MockRule[] }> {
  const res = await fetch(`${API_BASE}/recordings/${id}/network/mock-rules`);
  ensureOk(res);
  return res.json();
}

export async function saveRecordingMockRules(id: string, rules: MockRule[]): Promise<{ ok: boolean }> {
  const res = await fetch(`${API_BASE}/recordings/${id}/network/mock-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules }),
  });
  ensureOk(res);
  return res.json();
}
