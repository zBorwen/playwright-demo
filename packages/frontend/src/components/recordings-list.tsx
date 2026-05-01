import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchRecordings, deleteRecording, deleteRecordings, type Recording } from '@/lib/api';
import { RecordingForm } from '@/components/recording-form';

interface RecordingsListProps {
  projectId?: string;
  reloadKey?: number;
}

export function RecordingsList({ projectId, reloadKey = 0 }: RecordingsListProps) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const fetch = () => {
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
    fetch();
  }, [projectId, reloadKey]);

  const handleSuccess = () => {
    setShowForm(false);
    fetch();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === recordings.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(recordings.map(r => r.id)));
    }
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
    fetch();
  };

  const handleDeleteSingle = async (id: string, title: string) => {
    if (!confirm(`确定要删除录制「${title}」吗？`)) return;
    setDeleting(true);
    await deleteRecording(id);
    setDeleting(false);
    setSelectedIds(new Set());
    fetch();
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
                  <h3 className="font-medium">{r.title}</h3>
                  {r.targetUrl && (
                    <p className="mt-1 text-sm text-zinc-400">{r.targetUrl}</p>
                  )}
                </div>
                <span className="text-xs text-zinc-500">
                  {new Date(r.createdAt).toLocaleDateString()}
                </span>
              </Link>
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
