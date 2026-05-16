import type { RecordingAction, NetworkEntry, MockRule, BrowserType } from '@playwright-demo/shared';
export type { RecordingAction, BrowserType };

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

export async function fetchRecordingCodegen(id: string, browserType?: BrowserType): Promise<{ codegen: string }> {
  const qs = browserType ? `?browserType=${browserType}` : '';
  return request(`${API_BASE}/recordings/${id}/codegen${qs}`);
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

export async function batchReplayRecordings(recordingIds: string[], options?: { useMock?: boolean; headless?: boolean; browserType?: BrowserType }): Promise<{ batchId: string; total: number; results: Array<{ recordingId: string; executionId: string; projectId?: string }> }> {
  return request(`${API_BASE}/recordings/batch-replay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordingIds, useMock: options?.useMock ?? false, headless: options?.headless, browserType: options?.browserType }),
  });
}

export async function batchReplayProjects(projectIds: string[], options?: { useMock?: boolean; headless?: boolean; browserType?: BrowserType }): Promise<{ batchId: string; total: number; results: Array<{ recordingId: string; executionId: string; projectId?: string }> }> {
  return request(`${API_BASE}/recordings/batch-replay/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectIds, useMock: options?.useMock ?? false, headless: options?.headless, browserType: options?.browserType }),
  });
}

export async function startRecording(id: string, options?: { browserType?: BrowserType }): Promise<{ ok: boolean }> {
  const params = new URLSearchParams();
  if (options?.browserType) params.set('browserType', options.browserType);
  const qs = params.toString();
  return request(`${API_BASE}/recordings/${id}/start${qs ? `?${qs}` : ''}`, { method: 'POST' });
}

export async function stopRecording(id: string): Promise<{ ok: boolean }> {
  return request(`${API_BASE}/recordings/${id}/stop`, { method: 'POST' });
}

export async function replayRecording(id: string, options?: { useMock?: boolean; replaySpeed?: 'fast' | 'normal' | 'slow'; headless?: boolean; browserType?: BrowserType }): Promise<{ ok: boolean; executionId: string }> {
  const params = new URLSearchParams();
  if (options?.useMock) params.set('mock', 'true');
  if (options?.replaySpeed && options.replaySpeed !== 'normal') params.set('replaySpeed', options.replaySpeed);
  if (options?.headless !== undefined) params.set('headless', String(options.headless));
  if (options?.browserType) params.set('browserType', options.browserType);
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
