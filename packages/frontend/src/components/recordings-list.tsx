import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchRecordings, deleteRecording, deleteRecordings, batchReplayRecordings, type Recording } from '@/lib/api';
import { RecordingForm } from '@/components/recording-form';
import { useRecordingReplayStore } from '@/store/recording-replay-store';

interface RecordingsListProps {
  projectId?: string;
}

function ReplayStatusIndicator({ recordingId }: { recordingId: string }) {
  const replay = useRecordingReplayStore(s => s.recordingReplays[recordingId]);
  if (!replay || replay.status === 'running') {
    return replay ? (
      <span className="ml-2 inline-flex items-center gap-1.5 text-xs">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-400" />
        <span className="text-green-400">回放中</span>
      </span>
    ) : null;
  }
  if (replay.status === 'passed') {
    return <span className="ml-2 text-xs text-green-400">✓</span>;
  }
  return <span className="ml-2 text-xs text-red-400">✗</span>;
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
    // localStorage may be blocked in private mode; non-critical
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
    <label className="flex items-center gap-1 text-xs text-zinc-500" title="Mock 模式" onClick={(e) => e.stopPropagation()}>
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
      // Group by mock setting, make separate API calls
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

  if (loading) return <p className="text-zinc-500">加载中...</p>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">录制列表</h2>
        <button
          className="rounded bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700"
          onClick={() => setShowForm(true)}
        >
          + 新建录制
        </button>
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}

      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded border border-zinc-700 bg-zinc-900 px-4 py-2">
          <span className="text-sm text-zinc-300">已选择 {selectedIds.size} 条</span>
          <button
            onClick={handleDeleteSelected}
            disabled={deleting}
            className="rounded bg-red-900 px-3 py-1 text-sm text-red-200 hover:bg-red-800 disabled:opacity-50"
          >
            {deleting ? '删除中…' : '批量删除'}
          </button>
          <button
            onClick={handleBatchReplaySelected}
            disabled={replaying}
            className="rounded bg-green-900 px-3 py-1 text-sm text-green-200 hover:bg-green-800 disabled:opacity-50"
          >
            {replaying ? '回放中…' : '批量回放'}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            取消选择
          </button>
        </div>
      )}

      {recordings.length === 0 ? (
        <p className="text-zinc-500">暂无录制</p>
      ) : (
        <div className="space-y-2">
          {recordings.map((r) => (
            <div
              key={r.id}
              className="group flex items-center gap-3 rounded border border-zinc-800 bg-zinc-900 p-4 transition hover:border-zinc-600"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(r.id)}
                onChange={() => toggleSelect(r.id)}
                onClick={(e) => e.stopPropagation()}
                className="rounded border-zinc-600 bg-zinc-800"
              />
              <Link
                to={`/recordings/${r.id}`}
                className="flex flex-1 cursor-pointer items-center justify-between"
              >
                <div>
                  <h3 className="font-medium">{r.title}<ReplayStatusIndicator recordingId={r.id} /></h3>
                  {r.targetUrl && (
                    <p className="mt-1 text-sm text-zinc-400">{r.targetUrl}</p>
                  )}
                </div>
                <span className="text-xs text-zinc-500">
                  {new Date(r.createdAt).toLocaleDateString()}
                </span>
              </Link>
              <MockToggle recordingId={r.id} />
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteSingle(r.id, r.title); }}
                disabled={deleting}
                className="ml-1 rounded p-1.5 text-zinc-600 transition hover:text-red-400 hover:bg-red-950 opacity-0 group-hover:opacity-100 disabled:opacity-50"
                title="删除录制"
              >
                {deleting && selectedIds.has(r.id) ? '…' : '🗑'}
              </button>
            </div>
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
