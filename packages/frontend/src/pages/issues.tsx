import { useCallback, useEffect, useMemo, useState } from 'react';
import { CirclePlus, Search, Trash2 } from 'lucide-react';
import {
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  type Issue,
  type IssueActivity,
  type IssueFilters,
  type IssuePriority,
  type IssueStatus,
} from '@playwright-demo/shared';
import {
  createIssue,
  deleteIssue,
  fetchIssueActivity,
  fetchIssues,
  updateIssue,
} from '@/lib/issues-api';

const STATUS_LABELS: Record<IssueStatus, string> = {
  open: 'Open',
  'in-progress': 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

const PRIORITY_LABELS: Record<IssuePriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export function IssuesPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activity, setActivity] = useState<IssueActivity[]>([]);
  const [filters, setFilters] = useState<IssueFilters>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const selectedIssue = useMemo(
    () => issues.find((issue) => issue.id === selectedId) ?? null,
    [issues, selectedId],
  );

  const loadIssues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchIssues(filters);
      setIssues(next);
      setSelectedId((current) => current && next.some((issue) => issue.id === current) ? current : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load issues');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadIssues();
  }, [loadIssues]);

  useEffect(() => {
    if (!selectedId) {
      setActivity([]);
      return;
    }
    void fetchIssueActivity(selectedId)
      .then(setActivity)
      .catch(() => setActivity([]));
  }, [selectedId, selectedIssue?.updatedAt]);

  async function handleStatusChange(issue: Issue, status: IssueStatus) {
    if (issue.status === status) return;
    await updateIssue(issue.id, { status });
    await loadIssues();
  }

  async function handleDelete(issue: Issue) {
    if (!window.confirm(`Delete "${issue.title}"?`)) return;
    await deleteIssue(issue.id);
    if (selectedId === issue.id) setSelectedId(null);
    await loadIssues();
  }

  return (
    <div className="min-h-full">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Issue workspace</h1>
          <p className="mt-1 text-sm text-zinc-500">Track work, ownership, priority, and status history.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((value) => !value)}
          className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white hover:bg-violet-400"
        >
          <CirclePlus className="h-4 w-4" />
          New issue
        </button>
      </div>

      {showCreate && (
        <CreateIssueForm
          onCreated={async () => {
            setShowCreate(false);
            await loadIssues();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      <IssueFiltersBar filters={filters} onChange={setFilters} />

      {error && <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

      <div className="grid min-h-[520px] grid-cols-1 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0 border-b border-zinc-800 xl:border-b-0 xl:border-r">
          <div className="grid grid-cols-[minmax(0,1fr)_120px_100px_100px] gap-3 border-b border-zinc-800 px-4 py-2 text-xs font-medium uppercase tracking-wide text-zinc-600">
            <span>Issue</span>
            <span>Assignee</span>
            <span>Priority</span>
            <span>Status</span>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-zinc-500">Loading issues…</div>
          ) : issues.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">No issues match the current filters.</div>
          ) : (
            <div className="divide-y divide-zinc-900">
              {issues.map((issue) => (
                <button
                  key={issue.id}
                  type="button"
                  onClick={() => setSelectedId(issue.id)}
                  className={`grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_120px_100px_100px] gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-900/70 ${selectedId === issue.id ? 'bg-violet-500/10' : ''}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-zinc-200">{issue.title}</span>
                    <span className="mt-1 block truncate text-xs text-zinc-600">{issue.labels.join(' · ') || 'No labels'}</span>
                  </span>
                  <span className="truncate text-sm text-zinc-400">{issue.assignee || 'Unassigned'}</span>
                  <span className="text-sm text-zinc-400">{PRIORITY_LABELS[issue.priority]}</span>
                  <span className="text-sm text-zinc-400">{STATUS_LABELS[issue.status]}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="min-w-0 p-5">
          {selectedIssue ? (
            <IssueDetail
              issue={selectedIssue}
              activity={activity}
              onStatusChange={(status) => void handleStatusChange(selectedIssue, status)}
              onDelete={() => void handleDelete(selectedIssue)}
            />
          ) : (
            <div className="flex h-full min-h-72 items-center justify-center text-center text-sm text-zinc-600">
              Select an issue to inspect details and activity.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function IssueFiltersBar({ filters, onChange }: { filters: IssueFilters; onChange: (filters: IssueFilters) => void }) {
  return (
    <div className="mb-4 flex flex-wrap gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <label className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-600" />
        <input
          value={filters.search ?? ''}
          onChange={(event) => onChange({ ...filters, search: event.target.value || undefined })}
          placeholder="Search title or description"
          className="w-full rounded-md border border-zinc-800 bg-zinc-950 py-2 pl-9 pr-3 text-sm text-zinc-200 outline-none focus:border-violet-500"
        />
      </label>
      <select
        aria-label="Filter by status"
        value={filters.status ?? ''}
        onChange={(event) => onChange({ ...filters, status: (event.target.value || undefined) as IssueStatus | undefined })}
        className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300"
      >
        <option value="">All statuses</option>
        {ISSUE_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
      </select>
      <select
        aria-label="Filter by priority"
        value={filters.priority ?? ''}
        onChange={(event) => onChange({ ...filters, priority: (event.target.value || undefined) as IssuePriority | undefined })}
        className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300"
      >
        <option value="">All priorities</option>
        {ISSUE_PRIORITIES.map((priority) => <option key={priority} value={priority}>{PRIORITY_LABELS[priority]}</option>)}
      </select>
    </div>
  );
}

function CreateIssueForm({ onCreated, onCancel }: { onCreated: () => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<IssuePriority>('medium');
  const [assignee, setAssignee] = useState('');
  const [labels, setLabels] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createIssue({
        title,
        description,
        priority,
        assignee: assignee || null,
        labels: labels.split(',').map((label) => label.trim()).filter(Boolean),
      });
      await onCreated();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create issue');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="lg:col-span-2">
          <span className="mb-1 block text-xs font-medium text-zinc-500">Title</span>
          <input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500" />
        </label>
        <label className="lg:col-span-2">
          <span className="mb-1 flex justify-between text-xs font-medium text-zinc-500"><span>Description</span><span>{description.length}/300</span></span>
          <textarea maxLength={300} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="w-full resize-y rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500" />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-zinc-500">Priority</span>
          <select value={priority} onChange={(event) => setPriority(event.target.value as IssuePriority)} className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300">
            {ISSUE_PRIORITIES.map((value) => <option key={value} value={value}>{PRIORITY_LABELS[value]}</option>)}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-zinc-500">Assignee</span>
          <input value={assignee} onChange={(event) => setAssignee(event.target.value)} className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500" />
        </label>
        <label className="lg:col-span-2">
          <span className="mb-1 block text-xs font-medium text-zinc-500">Labels (comma separated)</span>
          <input value={labels} onChange={(event) => setLabels(event.target.value)} className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-violet-500" />
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="cursor-pointer rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800">Cancel</button>
        <button disabled={saving} type="submit" className="cursor-pointer rounded-md bg-violet-500 px-3 py-2 text-sm font-medium text-white hover:bg-violet-400 disabled:opacity-50">{saving ? 'Creating…' : 'Create issue'}</button>
      </div>
    </form>
  );
}

function IssueDetail({ issue, activity, onStatusChange, onDelete }: {
  issue: Issue;
  activity: IssueActivity[];
  onStatusChange: (status: IssueStatus) => void;
  onDelete: () => void;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-semibold text-zinc-100">{issue.title}</h2>
          <p className="mt-1 text-xs text-zinc-600">Updated {new Date(issue.updatedAt).toLocaleString()}</p>
        </div>
        <button type="button" aria-label="Delete issue" onClick={onDelete} className="cursor-pointer rounded-md p-2 text-zinc-600 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-600">Description</p>
        <p className="max-w-full whitespace-pre-wrap break-words text-sm leading-6 text-zinc-300">{issue.description || 'No description.'}</p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div><p className="text-xs text-zinc-600">Priority</p><p className="mt-1 text-zinc-300">{PRIORITY_LABELS[issue.priority]}</p></div>
        <div><p className="text-xs text-zinc-600">Assignee</p><p className="mt-1 break-words text-zinc-300">{issue.assignee || 'Unassigned'}</p></div>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-600">Status</p>
        <div className="flex flex-wrap gap-2">
          {ISSUE_STATUSES.map((status) => (
            <button key={status} type="button" onClick={() => onStatusChange(status)} className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs ${issue.status === status ? 'border-violet-400 bg-violet-500/15 text-violet-300' : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'}`}>{STATUS_LABELS[status]}</button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-600">Labels</p>
        <div className="flex flex-wrap gap-2">
          {issue.labels.length ? issue.labels.map((label) => <span key={label} className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-400">{label}</span>) : <span className="text-sm text-zinc-600">No labels</span>}
        </div>
      </div>

      <div className="mt-6 border-t border-zinc-800 pt-5">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-600">Activity</p>
        <div className="space-y-3">
          {activity.map((entry) => (
            <div key={entry.id} className="border-l border-zinc-800 pl-3">
              <p className="break-words text-sm text-zinc-400">{entry.message}</p>
              <p className="mt-1 text-xs text-zinc-700">{new Date(entry.createdAt).toLocaleString()}</p>
            </div>
          ))}
          {!activity.length && <p className="text-sm text-zinc-600">No activity yet.</p>}
        </div>
      </div>
    </div>
  );
}
