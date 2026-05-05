import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchProjects, batchReplayProjects, type Project } from '@/lib/api';
import { RecordingsList } from '@/components/recordings-list';
import { BatchReplayPanel, type BatchReplayItem } from '@/components/batch-replay-panel';
import { useWebSocket } from '@/hooks/use-websocket';

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useMock, setUseMock] = useState(false);
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
    if (!id) return;
    fetchProjects()
      .then((projects) => {
        const found = projects.find((p) => p.id === id);
        if (found) {
          setProject(found);
        } else {
          setError('项目不存在');
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  const handleBatchReplayProject = async () => {
    if (!id) return;
    setReplaying(true);
    setBatchReplayState({ batchId: '', items: [], isRunning: true, passed: 0, failed: 0 });
    try {
      const result = await batchReplayProjects([id], { useMock });
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
  };

  if (loading) return <p className="text-zinc-500">加载中...</p>;
  if (error || !project) return <p className="text-red-400">{error || '项目不存在'}</p>;

  return (
    <div>
      <div className="mb-6">
        <Link to="/projects" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← 返回项目列表
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{project.name}</h1>
            {project.description && (
              <p className="mt-1 text-zinc-400">{project.description}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm text-zinc-400">
              <input
                type="checkbox"
                checked={useMock}
                onChange={(e) => setUseMock(e.target.checked)}
                className="rounded border-zinc-600 bg-zinc-800"
              />
              Mock 模式
            </label>
            <button
              onClick={handleBatchReplayProject}
              disabled={replaying}
              className="rounded bg-green-900 px-4 py-2 text-sm hover:bg-green-800 disabled:opacity-50"
            >
              {replaying ? '⏳ 批量回放中' : '▶ 批量回放本项目'}
            </button>
          </div>
        </div>
      </div>

      {batchReplayState && batchReplayState.items.length > 0 && (
        <BatchReplayPanel
          total={batchReplayState.items.length}
          items={batchReplayState.items}
          isRunning={batchReplayState.isRunning}
          passed={batchReplayState.passed}
          failed={batchReplayState.failed}
        />
      )}

      <RecordingsList projectId={id} useMock={useMock} />
    </div>
  );
}
