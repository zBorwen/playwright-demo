import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Play, Globe, Calendar } from 'lucide-react';
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.checked;
    setChecked(next);
    setRecordingMock(recordingId, next);
  };

  return (
    <label className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs text-zinc-400 cursor-pointer hover:text-zinc-300 transition-colors" title="Mock 模式" onClick={(e) => e.stopPropagation()}>
      <input
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        disabled={isRunning}
        className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
      />
      Mock
    </label>
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
      className="group relative flex flex-col rounded-lg border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-600 hover:bg-zinc-800/50"
    >
      {/* Top row: icon + title + actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
            <Globe className="h-4 w-4 text-blue-400" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium text-zinc-100">
              {recording.title}
              <ReplayStatusIndicator recordingId={recording.id} />
            </h3>
          </div>
        </div>
        {/* Action buttons - shown on hover */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-auto" onClick={(e) => e.preventDefault()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            className="rounded border-zinc-600 bg-zinc-800"
          />
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
            className="rounded p-1 text-zinc-500 transition hover:text-red-400 hover:bg-red-950"
            title="删除录制"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Bottom row: stats */}
      <div className="mt-3 flex items-center gap-4 border-t border-zinc-800 pt-3 text-xs text-zinc-500">
        {recording.targetUrl && (
          <span className="truncate max-w-[200px]" title={recording.targetUrl}>
            {recording.targetUrl}
          </span>
        )}
        <span className="flex items-center gap-1 whitespace-nowrap">
          <Calendar className="h-3 w-3" />
          {timeAgo}
        </span>
        <span className="z-10 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
          <MockToggle recordingId={recording.id} />
        </span>
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
      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5">
          <span className="text-sm font-medium text-zinc-300">已选择 {selectedIds.size} 条录制</span>
          <button
            onClick={handleBatchReplaySelected}
            disabled={replaying}
            className="inline-flex items-center gap-1.5 rounded bg-green-900 px-3 py-1.5 text-sm font-medium text-green-200 transition-colors hover:bg-green-800 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            {replaying ? '回放中…' : '批量回放'}
          </button>
          <button
            onClick={handleDeleteSelected}
            disabled={deleting}
            className="rounded bg-red-900 px-3 py-1.5 text-sm text-red-200 hover:bg-red-800 disabled:opacity-50 transition-colors"
          >
            {deleting ? '删除中…' : '批量删除'}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-zinc-400 transition-colors hover:text-zinc-200"
          >
            取消选择
          </button>
        </div>
      )}

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
