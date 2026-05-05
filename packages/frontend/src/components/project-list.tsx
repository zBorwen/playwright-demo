import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { fetchProjects, deleteProject, batchReplayProjects } from '@/lib/api';
import { useAppStore } from '@/store/app-store';
import { BatchReplayPanel, type BatchReplayItem } from '@/components/batch-replay-panel';
import { useWebSocket } from '@/hooks/use-websocket';

export function ProjectList({ reloadKey = 0 }: { reloadKey?: number }) {
  const { projects, loadingProjects, projectError, setProjects, setLoadingProjects, setProjectError } =
    useAppStore();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [replaying, setReplaying] = useState(false);
  const [batchReplayState, setBatchReplayState] = useState<{
    batchId: string;
    items: BatchReplayItem[];
    isRunning: boolean;
    passed: number;
    failed: number;
  } | null>(null);

  const handleWsMessage = useCallback((msg: { type: string; payload: unknown }) => {
    switch (msg.type) {
      case 'batch-replay:result': {
        const p = msg.payload as { recordingId: string; status: 'passed' | 'failed' | 'running' | 'pending'; error?: string; executionId?: string };
        setBatchReplayState(prev => {
          if (!prev) return prev;
          const idx = prev.items.findIndex(i => i.recordingId === p.recordingId);
          if (idx < 0) return prev;
          const updated = [...prev.items];
          updated[idx] = { ...updated[idx], status: p.status, error: p.error, executionId: p.executionId };
          const passed = updated.filter(i => i.status === 'passed').length;
          const failed = updated.filter(i => i.status === 'failed').length;
          return { ...prev, items: updated, passed, failed, isRunning: passed + failed < prev.items.length };
        });
        break;
      }
    }
  }, []);

  useWebSocket(handleWsMessage);

  useEffect(() => {
    setLoadingProjects(true);
    fetchProjects()
      .then((data) => {
        setProjects(data);
        setProjectError(null);
      })
      .catch((error: Error) => {
        setProjectError(error.message);
      })
      .finally(() => setLoadingProjects(false));
  }, [reloadKey]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除项目「${name}」吗？该项目下的所有录制也将被删除。`)) return;
    setDeleting(id);
    await deleteProject(id);
    setDeleting(null);
    // Refresh the list
    const data = await fetchProjects();
    setProjects(data);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatchReplaySelected = async () => {
    if (selectedIds.size === 0) return;
    setReplaying(true);
    setBatchReplayState({ batchId: '', items: [], isRunning: true, passed: 0, failed: 0 });
    try {
      const result = await batchReplayProjects([...selectedIds]);
      setBatchReplayState(prev => prev ? {
        ...prev,
        batchId: result.batchId,
        items: result.results.map(r => ({ recordingId: r.recordingId, status: 'pending' as const })),
      } : null);
    } catch (e) {
      console.error('Batch replay failed:', e);
      setBatchReplayState(null);
    }
    setReplaying(false);
    setSelectedIds(new Set());
  };

  if (loadingProjects) return <p className="text-zinc-500">加载中...</p>;
  if (projectError) return <p className="text-red-400">{projectError}</p>;
  if (!projects.length) return <p className="text-zinc-500">暂无项目</p>;

  return (
    <div>
      {batchReplayState && batchReplayState.items.length > 0 && (
        <BatchReplayPanel
          total={batchReplayState.items.length}
          items={batchReplayState.items}
          isRunning={batchReplayState.isRunning}
          passed={batchReplayState.passed}
          failed={batchReplayState.failed}
        />
      )}

      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded border border-zinc-700 bg-zinc-900 px-4 py-2">
          <span className="text-sm text-zinc-300">已选择 {selectedIds.size} 个项目</span>
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <div
            key={p.id}
            className="group relative rounded-lg border border-zinc-800 bg-zinc-900 p-5 transition hover:border-zinc-600"
          >
            <Link to={`/projects/${p.id}`} className="block">
              <h3 className="font-semibold">{p.name}</h3>
              {p.description && (
                <p className="mt-1 text-sm text-zinc-400">{p.description}</p>
              )}
            </Link>
            <div className="absolute top-3 right-3 flex items-center gap-1">
              <input
                type="checkbox"
                checked={selectedIds.has(p.id)}
                onChange={() => toggleSelect(p.id)}
                onClick={(e) => e.stopPropagation()}
                className="rounded border-zinc-600 bg-zinc-800"
              />
              <button
                onClick={() => handleDelete(p.id, p.name)}
                disabled={deleting === p.id}
                className="rounded p-1 text-zinc-600 transition hover:text-red-400 hover:bg-red-950 opacity-0 group-hover:opacity-100 disabled:opacity-50"
                title="删除项目"
              >
                {deleting === p.id ? '…' : '🗑'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
