import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Globe, Calendar, Check } from 'lucide-react';
import { fetchRecordings, deleteRecording, deleteRecordings, batchReplayRecordings, type Recording } from '@/lib/api';
import { StatusBadge, StatusIcon } from '@/components/status-badge';
import { BatchActionBar } from '@/components/batch-action-bar';
import { CardSkeleton } from '@/components/skeleton';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { formatRelativeTime } from '@/lib/time-ago';
import { useRecordingReplayStore } from '@/store/recording-replay-store';

interface RecordingsListProps {
  projectId?: string;
}

function ReplayStatusIndicator({ recordingId }: { recordingId: string }) {
  const replay = useRecordingReplayStore(s => s.recordingReplays[recordingId]);
  if (!replay) return null;
  if (replay.status === 'running') {
    return (
      <span className="ml-2 inline-flex items-center gap-1.5 text-xs">
        <StatusBadge status="running" label="回放中" />
      </span>
    );
  }
  return (
    <span className="ml-2 inline-flex items-center">
      <StatusIcon status={replay.status} />
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
  const timeAgo = formatRelativeTime(recording.createdAt);

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
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

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    setPendingDelete([...selectedIds]);
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDelete) return;
    if (pendingDelete.length === 1) {
      await deleteRecording(pendingDelete[0]);
    } else {
      await deleteRecordings(pendingDelete);
    }
    setPendingDelete(null);
    setSelectedIds(new Set());
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

  if (loading) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}</div>;

  return (
    <div>
      <BatchActionBar
        count={selectedIds.size}
        countLabel="条录制"
        actions={[
          {
            label: '批量回放',
            loadingLabel: '回放中…',
            loading: replaying,
            disabled: false,
            variant: 'primary',
            onClick: handleBatchReplaySelected,
          },
          {
            label: '批量删除',
            loadingLabel: '删除中…',
            loading: pendingDelete !== null,
            disabled: false,
            variant: 'danger',
            onClick: handleDeleteSelected,
          },
        ]}
        onCancel={() => setSelectedIds(new Set())}
      />

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
              onDelete={() => setPendingDelete([r.id])}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除录制"
        description={
          pendingDelete && pendingDelete.length === 1
            ? '确定要删除该录制吗？'
            : `确定要删除选中的 ${pendingDelete?.length} 条录制吗？`
        }
        variant="danger"
        confirmLabel="删除"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
