import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Play, Globe, Calendar, Check, X } from 'lucide-react';
import { fetchRecordings, deleteRecording, deleteRecordings, batchReplayRecordings, type Recording } from '@/lib/api';
import { RecordingForm } from '@/components/recording-form';
import { StatusBadge, StatusIcon } from '@/components/status-badge';
import { useRecordingReplayStore } from '@/store/recording-replay-store';

interface RecordingsListProps {
  projectId?: string;
}

function ReplayStatusIndicator({ recordingId }: { recordingId: string }) {
  const replay = useRecordingReplayStore(s => s.recordingReplays[recordingId]);
  if (!replay || replay.status === 'running') {
    return replay ? (
      <span className="ml-2 inline-flex items-center gap-1.5 text-xs">
        <StatusBadge status="running" label="回放中" />
      </span>
    ) : null;
  }
  return (
    <span className="ml-2 inline-flex items-center">
      <StatusIcon status={replay.status === 'passed' ? 'passed' : 'failed'} />
    </span>
  );
}

function getRecordingMock(recordingId: string): boolean {
  try {
    return localStorage.getItem(`replay-use-mock:${recordingId}`) === 'true';
  } catch {
    return false;
  }
}

function setRecordingMock(recordingId: string, checked: boolean): void {
  try {
    localStorage.setItem(`replay-use-mock:${recordingId}`, String(checked));
  } catch {
    // localStorage may be blocked; non-critical
  }
}

function MockToggle({ recordingId }: { recordingId: string }) {
  const replay = useRecordingReplayStore(s => s.recordingReplays[recordingId]);
  const isRunning = replay?.status === 'running';
  const [checked, setChecked] = useState(() => getRecordingMock(recordingId));

  const handleChange = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !checked;
    setChecked(next);
    setRecordingMock(recordingId, next);
  };

  return (
    <button
      type="button"
      onClick={handleChange}
      disabled={isRunning}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
        checked
          ? 'bg-violet-500/20 text-violet-400 ring-1 ring-violet-500/30'
          : 'border border-zinc-700 bg-zinc-800 text-zinc-500 hover:text-zinc-300'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
      title="Mock 模式"
    >
      <span className={`h-2 w-2 rounded-full transition-colors ${checked ? 'bg-violet-400' : 'bg-zinc-600'}`} />
      Mock
    </button>
  );
}

function RecordingCard({ recording, selected, onToggleSelect, onDelete }: {
  recording: Recording;
  selected: boolean;
  onToggleSelect: () => void;
  onDelete: () => void;
}) {
  const timeAgo = (() => {
    const diff = Date.now() - new Date(recording.createdAt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} 天前`;
    return new Date(recording.createdAt).toLocaleDateString();
  })();

  return (
    <Link
      to={`/recordings/${recording.id}`}
      className={`group relative flex flex-col rounded-xl border p-4 transition-all hover:shadow-lg hover:shadow-black/20 ${
        selected
          ? 'border-violet-400/50'
          : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800/50'
      }`}
    >
      {/* Header row: Icon + Title + Actions */}
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 ring-1 ring-blue-500/20">
          <Globe className="h-4 w-4 text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-medium text-zinc-100">
              {recording.title}
            </h3>
            <ReplayStatusIndicator recordingId={recording.id} />
          </div>
          {recording.targetUrl && (
            <p className="mt-1 truncate text-xs text-zinc-500" title={recording.targetUrl}>
              {recording.targetUrl}
            </p>
          )}
        </div>
        {/* Actions column — always visible, right-aligned */}
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Selection checkbox */}
          <button
            type="button"
            role="checkbox"
            aria-checked={selected}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(); }}
            className={`flex h-6 w-6 cursor-pointer items-center justify-center rounded transition-all ${
              selected
                ? 'bg-violet-500 text-white'
                : 'opacity-0 group-hover:opacity-100 border border-zinc-600 bg-zinc-800 text-zinc-400 hover:border-zinc-400 hover:text-zinc-200'
            }`}
            aria-label="选择录制"
          >
            {selected && <Check className="h-3 w-3" />}
          </button>
          {/* Delete button */}
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-zinc-500 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-950/50 hover:text-red-400"
            title="删除录制"
            aria-label="删除录制"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Bottom row: time + Mock toggle */}
      <div className="mt-3 flex items-center justify-between border-t border-zinc-800 pt-3 text-xs text-zinc-500">
        <span className="flex items-center gap-1 whitespace-nowrap">
          <Calendar className="h-3 w-3" />
          {timeAgo}
        </span>
        <MockToggle recordingId={recording.id} />
      </div>
    </Link>
  );
}

export function RecordingsList({ projectId }: RecordingsListProps) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [replaying, setReplaying] = useState(false);

  const loadData = () => {
    setLoading(true);
    fetchRecordings(projectId)
      .then((data) => {
        setRecordings(data);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
        setRecordings([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  const handleSuccess = () => {
    setShowForm(false);
    loadData();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    if (!confirm(`确定要删除选中的 ${count} 条录制吗？`)) return;
    setDeleting(true);
    if (selectedIds.size === 1) {
      await deleteRecording([...selectedIds][0]);
    } else {
      await deleteRecordings([...selectedIds]);
    }
    setSelectedIds(new Set());
    setDeleting(false);
    loadData();
  };

  const handleBatchReplaySelected = async () => {
    if (selectedIds.size === 0) return;
    setReplaying(true);
    try {
      const mockOn: string[] = [];
      const mockOff: string[] = [];
      for (const id of selectedIds) {
        if (getRecordingMock(id)) mockOn.push(id);
        else mockOff.push(id);
      }

      const allResults: Array<{ recordingId: string; executionId: string; projectId?: string }> = [];

      if (mockOn.length > 0) {
        const r = await batchReplayRecordings(mockOn, { useMock: true });
        allResults.push(...r.results);
      }
      if (mockOff.length > 0) {
        const r = await batchReplayRecordings(mockOff, { useMock: false });
        allResults.push(...r.results);
      }

      for (const r of allResults) {
        useRecordingReplayStore.getState().setRecordingStatus({
          recordingId: r.recordingId,
          status: 'running',
          projectId: r.projectId,
        });
      }
    } catch (e) {
      console.error('Batch replay failed:', e);
    }
    setReplaying(false);
    setSelectedIds(new Set());
  };

  const handleDeleteSingle = async (recId: string, title: string) => {
    if (!confirm(`确定要删除录制「${title}」吗？`)) return;
    setDeleting(true);
    await deleteRecording(recId);
    setDeleting(false);
    setSelectedIds(new Set());
    loadData();
  };

  if (loading) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-zinc-800" />)}</div>;

  return (
    <div>
      {/* Batch action bar */}
      <div
        className={`mb-4 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-2.5 transition-all duration-200 ease-out ${
          selectedIds.size > 0
            ? 'opacity-100 visible'
            : 'opacity-0 invisible h-0 py-0 border-0 overflow-hidden'
        }`}
      >
        <div className="flex items-center gap-3">
          {/* Selection count pill */}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-400">
            <Check className="h-3 w-3" />
            {selectedIds.size} 条录制
          </span>
          {/* Primary action */}
          <button
            onClick={handleBatchReplaySelected}
            disabled={replaying}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-medium text-white shadow-sm shadow-violet-600/20 transition-all hover:bg-violet-500 hover:shadow-violet-500/30 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play className="h-3.5 w-3.5" />
            {replaying ? '回放中…' : '批量回放'}
          </button>
          {/* Danger action */}
          <button
            onClick={handleDeleteSelected}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs font-medium text-red-400 transition-all hover:bg-red-500/20 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleting ? '删除中…' : '批量删除'}
          </button>
        </div>
        {/* Cancel */}
        <button
          onClick={() => setSelectedIds(new Set())}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
        >
          <X className="h-3.5 w-3.5" />
          取消
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {recordings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
          <Globe className="mb-4 h-12 w-12 text-zinc-700" />
          <p className="text-sm">暂无录制</p>
          <p className="mt-1 text-xs text-zinc-600">创建一个录制开始使用</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recordings.map((r) => (
            <RecordingCard
              key={r.id}
              recording={r}
              selected={selectedIds.has(r.id)}
              onToggleSelect={() => toggleSelect(r.id)}
              onDelete={() => handleDeleteSingle(r.id, r.title)}
            />
          ))}
        </div>
      )}

      {showForm && projectId && (
        <RecordingForm
          projectId={projectId}
          onSuccess={handleSuccess}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
