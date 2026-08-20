import type {
  CreateIssueInput,
  Issue,
  IssueActivity,
  IssueFilters,
  UpdateIssueInput,
} from '@playwright-demo/shared';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const result: { success: boolean; data: T; error?: { message: string } } = await response.json();
  if (!result.success) throw new Error(result.error?.message || 'Issue request failed');
  return result.data;
}

export async function fetchIssues(filters: IssueFilters = {}): Promise<Issue[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const query = params.size ? `?${params.toString()}` : '';
  return request(`${API_BASE}/issues${query}`);
}

export async function createIssue(input: CreateIssueInput): Promise<Issue> {
  return request(`${API_BASE}/issues`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function updateIssue(id: string, input: UpdateIssueInput): Promise<Issue> {
  return request(`${API_BASE}/issues/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function fetchIssueActivity(id: string): Promise<IssueActivity[]> {
  return request(`${API_BASE}/issues/${id}/activity`);
}

export async function deleteIssue(id: string): Promise<void> {
  await request(`${API_BASE}/issues/${id}`, { method: 'DELETE' });
}
