import { useState, useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchProjects, batchReplayProjects, type Project } from '@/lib/api';
import { RecordingsList } from '@/components/recordings-list';
import { useRecordingReplayStore } from '@/store/recording-replay-store';

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useMock, setUseMock] = useState(false);
  const [replaying, setReplaying] = useState(false);

  const recordingReplays = useRecordingReplayStore(s => s.recordingReplays);
  const hasActiveReplay = useMemo(() => {
    if (!id) return false;
    return Object.values(recordingReplays).some(
      r => r.projectId === id && r.status === 'running',
    );
  }, [recordingReplays, id]);

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
    try {
      const result = await batchReplayProjects([id], { useMock });
      for (const r of result.results) {
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
            <h1 className="text-2xl font-bold flex items-center gap-2">
              {project.name}
              {hasActiveReplay && (
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-400" />
              )}
            </h1>
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

      <RecordingsList projectId={id} useMock={useMock} />
    </div>
  );
}
