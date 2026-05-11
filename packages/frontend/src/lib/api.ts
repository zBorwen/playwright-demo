import type { RecordingAction, NetworkEntry, MockRule } from '@playwright-demo/shared';
export type { RecordingAction };

const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const result: { success: boolean; data: T; error?: { code: string; message: string } } = await res.json();
  if (!result.success) {
    throw new Error(result.error?.message || 'Unknown error');
  }
  return result.data;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  replaySpeed: 'fast' | 'normal' | 'slow';
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

export async function fetchProjects(): Promise<Project[]> {
  return request(`${API_BASE}/projects`);
}

export async function fetchProject(id: string): Promise<Project> {
  return request(`${API_BASE}/projects/${id}`);
}

export async function createProject(data: { name: string; description?: string }): Promise<Project> {
  return request(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: string): Promise<{ ok: boolean }> {
  return request(`${API_BASE}/projects/${id}`, { method: 'DELETE' });
}

export async function updateProjectSettings(id: string, data: { name?: string; description?: string | null; replaySpeed?: 'fast' | 'normal' | 'slow' }): Promise<Project> {
  return request(`${API_BASE}/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function createRecording(data: { projectId: string; title: string; targetUrl?: string }): Promise<Recording> {
  return request(`${API_BASE}/recordings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function fetchRecordings(projectId?: string): Promise<Recording[]> {
  const url = projectId
    ? `${API_BASE}/recordings?projectId=${projectId}`
    : `${API_BASE}/recordings`;
  return request(url);
}

export async function fetchRecording(id: string): Promise<Recording> {
  return request(`${API_BASE}/recordings/${id}`);
}

export async function fetchRecordingActions(id: string): Promise<{ actions: RecordingAction[] }> {
  return request(`${API_BASE}/recordings/${id}/actions`);
}

export async function fetchRecordingCodegen(id: string): Promise<{ codegen: string }> {
  return request(`${API_BASE}/recordings/${id}/codegen`);
}

export async function saveRecordingActions(id: string, actions: RecordingAction[]): Promise<{ ok: boolean }> {
  return request(`${API_BASE}/recordings/${id}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actions }),
  });
}

export async function deleteRecording(id: string): Promise<{ ok: boolean }> {
  return request(`${API_BASE}/recordings/${id}`, { method: 'DELETE' });
}

export async function deleteRecordings(ids: string[]): Promise<{ ok: boolean; deleted: number }> {
  return request(`${API_BASE}/recordings/batch`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

export async function batchReplayRecordings(recordingIds: string[], options?: { useMock?: boolean }): Promise<{ batchId: string; total: number; results: Array<{ recordingId: string; executionId: string; projectId?: string }> }> {
  return request(`${API_BASE}/recordings/batch-replay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordingIds, useMock: options?.useMock ?? false }),
  });
}

export async function batchReplayProjects(projectIds: string[], options?: { useMock?: boolean }): Promise<{ batchId: string; total: number; results: Array<{ recordingId: string; executionId: string; projectId?: string }> }> {
  return request(`${API_BASE}/recordings/batch-replay/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectIds, useMock: options?.useMock ?? false }),
  });
}

export async function startRecording(id: string): Promise<{ ok: boolean }> {
  return request(`${API_BASE}/recordings/${id}/start`, { method: 'POST' });
}

export async function stopRecording(id: string): Promise<{ ok: boolean }> {
  return request(`${API_BASE}/recordings/${id}/stop`, { method: 'POST' });
}

export async function replayRecording(id: string, options?: { useMock?: boolean; replaySpeed?: 'fast' | 'normal' | 'slow' }): Promise<{ ok: boolean; executionId: string }> {
  const params = new URLSearchParams();
  if (options?.useMock) params.set('mock', 'true');
  if (options?.replaySpeed && options.replaySpeed !== 'normal') params.set('replaySpeed', options.replaySpeed);
  const qs = params.toString();
  return request(`${API_BASE}/recordings/${id}/replay${qs ? `?${qs}` : ''}`, { method: 'POST' });
}

export interface Execution {
  id: string;
  recordingId: string;
  status: 'running' | 'passed' | 'failed';
  startedAt: string;
  finishedAt?: string;
  error?: string;
  trace?: string;
}

export interface ExecutionArtifact {
  id: string;
  executionId: string;
  type: 'screenshot' | 'har';
  path: string;
  stepIndex?: number;
}

export async function fetchExecutionArtifacts(id: string): Promise<ExecutionArtifact[]> {
  return request(`${API_BASE}/executions/${id}/artifacts`);
}

export async function fetchExecutions(recordingId: string): Promise<Execution[]> {
  return request(`${API_BASE}/executions?recordingId=${recordingId}`);
}

export async function fetchExecution(id: string): Promise<Execution> {
  return request(`${API_BASE}/executions/${id}`);
}

export function executionTraceUrl(executionId: string): string {
  return `/api/executions/${executionId}/trace`;
}

// ─── Network & Mock Rules ─────────────────────────────────────

export async function fetchRecordingNetwork(id: string): Promise<{ entries: NetworkEntry[] }> {
  return request(`${API_BASE}/recordings/${id}/network`);
}

export async function fetchRecordingMockRules(id: string): Promise<{ rules: MockRule[] }> {
  return request(`${API_BASE}/recordings/${id}/network/mock-rules`);
}

export async function saveRecordingMockRules(id: string, rules: MockRule[]): Promise<{ ok: boolean }> {
  return request(`${API_BASE}/recordings/${id}/network/mock-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules }),
  });
}
