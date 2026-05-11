import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderOpen, Trash2, Play } from 'lucide-react';
import { fetchProjects, fetchRecordings, fetchExecutions, deleteProject, batchReplayProjects, type Project } from '@/lib/api';
import { useAppStore } from '@/store/app-store';
import { StatusBadge } from '@/components/status-badge';
import { CardSkeleton } from '@/components/skeleton';
import { useRecordingReplayStore } from '@/store/recording-replay-store';

interface ProjectStats {
  recordingCount: number;
  lastStatus: 'passed' | 'failed' | 'running' | null;
  lastExecutedAt: string | null;
}

function ProjectCard({ project, stats, isReplaying, selected, onToggleSelect, onDelete }: {
  project: Project;
  stats: ProjectStats;
  isReplaying: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <Link
      to={`/projects/${project.id}`}
      className="group relative flex flex-col rounded-lg border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:border-zinc-600 hover:bg-zinc-800/50"
    >
      {/* Top row: icon + name + actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
            <FolderOpen className="h-5 w-5 text-violet-400" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-zinc-100">{project.name}</h3>
            {project.description && (
              <p className="mt-0.5 truncate text-xs text-zinc-500">{project.description}</p>
            )}
          </div>
        </div>
        {/* Action buttons - shown on hover or when selected */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.preventDefault()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            className="rounded border-zinc-600 bg-zinc-800"
          />
          <button
            onClick={(e) => { e.preventDefault(); onDelete(); }}
            className="rounded p-1 text-zinc-500 transition hover:text-red-400 hover:bg-red-950"
            title="删除项目"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Bottom row: stats */}
      <div className="mt-4 flex items-center gap-4 border-t border-zinc-800 pt-3 text-xs text-zinc-500">
        <span>{stats.recordingCount} 条录制</span>
        {stats.lastExecutedAt && (
          <span>最近执行 {stats.lastExecutedAt}</span>
        )}
        {stats.lastStatus && (
          <StatusBadge status={stats.lastStatus} />
        )}
        {isReplaying && (
          <StatusBadge status="running" label="回放中" />
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
  const [projectStats, setProjectStats] = useState<Map<string, ProjectStats>>(new Map());

  const recordingReplays = useRecordingReplayStore(s => s.recordingReplays);

  // Load project stats
  useEffect(() => {
    const loadStats = async () => {
      const stats = new Map<string, ProjectStats>();
      for (const project of projects) {
        try {
          const recordings = await fetchRecordings(project.id);
          const allExecutions: Array<{ status: string; finishedAt?: string }> = [];
          for (const rec of recordings) {
            try {
              const execs = await fetchExecutions(rec.id);
              allExecutions.push(...execs);
            } catch {
              // Skip if can't fetch executions for a recording
            }
          }
          allExecutions.sort((a, b) => {
            const ta = a.finishedAt ?? a.status === 'running' ? Date.now() : 0;
            const tb = b.finishedAt ?? b.status === 'running' ? Date.now() : 0;
            return new Date(tb).getTime() - new Date(ta).getTime();
          });
          const last = allExecutions[0];
          stats.set(project.id, {
            recordingCount: recordings.length,
            lastStatus: last?.status as ProjectStats['lastStatus'] ?? null,
            lastExecutedAt: last?.finishedAt
              ? (() => {
                  const diff = Date.now() - new Date(last.finishedAt!).getTime();
                  const mins = Math.floor(diff / 60000);
                  if (mins < 1) return '刚刚';
                  if (mins < 60) return `${mins} 分钟前`;
                  const hours = Math.floor(mins / 60);
                  if (hours < 24) return `${hours} 小时前`;
                  return `${Math.floor(hours / 24)} 天前`;
                })()
              : null,
          });
        } catch {
          stats.set(project.id, { recordingCount: 0, lastStatus: null, lastExecutedAt: null });
        }
      }
      setProjectStats(stats);
    };
    if (projects.length > 0) {
      loadStats();
    }
  }, [projects]);

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
    await deleteProject(id);
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
      const result = await batchReplayProjects([...selectedIds], { useMock: false });
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
  if (!projects.length) return (
    <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
      <FolderOpen className="mb-4 h-12 w-12 text-zinc-700" />
      <p className="text-sm">暂无项目</p>
      <p className="mt-1 text-xs text-zinc-600">创建一个项目开始使用</p>
    </div>
  );

  return (
    <div>
      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5">
          <span className="text-sm font-medium text-zinc-300">已选择 {selectedIds.size} 个项目</span>
          <button
            onClick={handleBatchReplaySelected}
            disabled={replaying}
            className="inline-flex items-center gap-1.5 rounded bg-green-900 px-3 py-1.5 text-sm font-medium text-green-200 transition-colors hover:bg-green-800 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            {replaying ? '回放中…' : '批量回放'}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-zinc-400 transition-colors hover:text-zinc-200"
          >
            取消选择
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => {
          const stats = projectStats.get(p.id) ?? { recordingCount: 0, lastStatus: null, lastExecutedAt: null };
          const isReplaying = Object.values(recordingReplays).some(
            r => r.projectId === p.id && r.status === 'running',
          );
          return (
            <ProjectCard
              key={p.id}
              project={p}
              stats={stats}
              isReplaying={isReplaying}
              selected={selectedIds.has(p.id)}
              onToggleSelect={() => toggleSelect(p.id)}
              onDelete={() => handleDelete(p.id, p.name)}
            />
          );
        })}
      </div>
    </div>
  );
}
