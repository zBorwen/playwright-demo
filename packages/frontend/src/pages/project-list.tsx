import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderOpen, Trash2, Check } from 'lucide-react';
import { fetchProjects, deleteProject, batchReplayProjects, type Project } from '@/lib/api';
import { useAppStore } from '@/store/app-store';
import { StatusBadge } from '@/components/ui/status-badge';
import { CardSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { BatchActionBar } from '@/components/ui/batch-action-bar';
import { formatRelativeTime } from '@/lib/time-ago';
import { useRecordingReplayStore } from '@/store/recording-replay-store';

interface ProjectStats {
  recordingCount: number;
  lastExecutedAt: string | null;
}

type ProjectReplayStatus = 'running' | 'passed' | 'failed' | null;

function getProjectReplayStatus(
  projectId: string,
  recordingReplays: Record<string, { status: 'running' | 'passed' | 'failed' | 'idle'; projectId?: string; finishedAt?: number }>,
): ProjectReplayStatus {
  const projectReplays = Object.values(recordingReplays).filter(r => r.projectId === projectId && r.status !== 'idle');
  if (projectReplays.length === 0) return null;
  // Running takes priority — project is still replaying
  if (projectReplays.some(r => r.status === 'running')) return 'running';
  // Otherwise, take the latest completed result
  projectReplays.sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
  const latest = projectReplays[0];
  if (latest.status === 'idle') return null;
  return latest.status;
}

function ProjectCard({ project, stats, replayStatus, selected, onToggleSelect, onDelete }: {
  project: Project;
  stats: ProjectStats;
  replayStatus: ProjectReplayStatus;
  selected: boolean;
  onToggleSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <Link
      to={`/projects/${project.id}`}
      className={`group relative flex flex-col rounded-xl border p-4 transition-all hover:shadow-lg hover:shadow-black/20 ${
        selected
          ? 'border-violet-400/50'
          : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800/50'
      }`}
    >
      {/* Header row: Icon + Name/Desc + Actions */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 ring-1 ring-violet-500/20">
          <FolderOpen className="h-4 w-4 text-violet-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-zinc-100">{project.name}</h3>
          {project.description && (
            <p className="mt-1 truncate text-xs text-zinc-500">{project.description}</p>
          )}
        </div>
        {/* Actions column */}
        <div className="flex shrink-0 items-center gap-1.5">
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
            aria-label="选择项目"
          >
            {selected && <Check className="h-3 w-3" />}
          </button>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-zinc-500 opacity-0 transition-all group-hover:opacity-100 hover:bg-red-950/50 hover:text-red-400"
            title="删除项目"
            aria-label={`删除项目「${project.name}」`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-3 flex items-center gap-4 border-t border-zinc-800 pt-3 text-xs text-zinc-500">
        <span>{stats.recordingCount} 条录制</span>
        {stats.lastExecutedAt && (
          <span>最近执行 {stats.lastExecutedAt}</span>
        )}
        {replayStatus && (
          <StatusBadge status={replayStatus} />
        )}
      </div>
    </Link>
  );
}

export function ProjectList({ reloadKey = 0 }: { reloadKey?: number }) {
  const { projects, loadingProjects, projectError, setProjects, setLoadingProjects, setProjectError } =
    useAppStore();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [replaying, setReplaying] = useState(false);
  const [batchHeadless, setBatchHeadless] = useState(true);
  const [batchBrowserType, setBatchBrowserType] = useState<'chromium' | 'firefox' | 'webkit'>('chromium');
  const recordingReplays = useRecordingReplayStore(s => s.recordingReplays);

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

  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const handleDelete = async (id: string, name: string) => {
    setPendingDelete({ id, name });
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDelete) return;
    await deleteProject(pendingDelete.id);
    setPendingDelete(null);
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
    try {
      const result = await batchReplayProjects([...selectedIds], { useMock: false, headless: batchHeadless, browserType: batchBrowserType });
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
    setSelectedIds(new Set());
  };

  if (loadingProjects) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>;
  if (projectError) return <p className="text-red-400">{projectError}</p>;
  if (!projects.length) return <EmptyState icon={FolderOpen} title="暂无项目" subtitle="创建一个项目开始使用" />;

  return (
    <div>
      <BatchActionBar
        count={selectedIds.size}
        countLabel="个项目"
        actions={[
          {
            label: '批量回放',
            loadingLabel: '回放中…',
            loading: replaying,
            disabled: false,
            variant: 'primary',
            onClick: handleBatchReplaySelected,
          },
        ]}
        onCancel={() => setSelectedIds(new Set())}
        headless={batchHeadless}
        browserType={batchBrowserType}
        onHeadlessChange={setBatchHeadless}
        onBrowserTypeChange={setBatchBrowserType}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => {
          const stats = p.stats ? {
            recordingCount: p.stats.recordingCount,
            lastExecutedAt: p.stats.lastExecutedAt ? formatRelativeTime(p.stats.lastExecutedAt) : null,
          } : { recordingCount: 0, lastExecutedAt: null };
          const replayStatus = getProjectReplayStatus(p.id, recordingReplays);
          return (
            <ProjectCard
              key={p.id}
              project={p}
              stats={stats}
              replayStatus={replayStatus}
              selected={selectedIds.has(p.id)}
              onToggleSelect={() => toggleSelect(p.id)}
              onDelete={() => handleDelete(p.id, p.name)}
            />
          );
        })}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除项目"
        description={`确定要删除项目「${pendingDelete?.name}」吗？该项目下的所有录制也将被删除。`}
        variant="danger"
        confirmLabel="删除"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
