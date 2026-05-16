import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Play } from 'lucide-react';
import { fetchProjects, type Project } from '@/lib/api';
import { RecordingsList } from '@/pages/recordings-list';
import { NewRecordingSlideOver } from '@/components/recording/new-recording-slide-over';
import { useRecordingReplayStore } from '@/store/recording-replay-store';

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewRecording, setShowNewRecording] = useState(false);

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

  if (loading) return <p className="text-zinc-500">加载中...</p>;
  if (error || !project) return <p className="text-red-400">{error || '项目不存在'}</p>;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-zinc-100">{project.name}</h1>
          {hasActiveReplay && (
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-400" />
          )}
        </div>
        <button
          onClick={() => setShowNewRecording(true)}
          className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-400"
        >
          <Play className="h-4 w-4" />
          新建录制
        </button>
      </div>
      {project.description && (
        <p className="mb-4 text-sm text-zinc-400">{project.description}</p>
      )}
      <RecordingsList projectId={id} />
      <NewRecordingSlideOver open={showNewRecording} onClose={() => setShowNewRecording(false)} projectId={id!} />
    </div>
  );
}
