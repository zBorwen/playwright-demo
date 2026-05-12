import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { fetchRecordings, fetchExecutions, fetchProjects } from '@/lib/api';
import { useRecordingReplayStore } from '@/store/recording-replay-store';
import { TrendChart } from '@/components/trend-chart';
import { StatusBadge } from '@/components/status-badge';
import type { Execution, Recording, Project } from '@/lib/api';

export function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const recordingReplays = useRecordingReplayStore(s => s.recordingReplays);

  useEffect(() => {
    Promise.all([
      fetchRecordings(),
      fetchExecutions(''),
      fetchProjects(),
    ]).then(([recs, execs, projs]) => {
      setRecordings(recs);
      setExecutions(execs);
      setProjects(projs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const todayExecutions = executions.filter(e => new Date(e.startedAt) >= todayStart);
    const failedExecutions = executions.filter(e => e.status === 'failed').slice(0, 5);
    const passedCount = executions.filter(e => e.status === 'passed').length;
    const passRate = executions.length > 0 ? Math.round((passedCount / executions.length) * 100) : 0;

    // 7-day trend data
    const dailyMap = new Map<string, { passed: number; failed: number }>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      dailyMap.set(key, { passed: 0, failed: 0 });
    }
    for (const e of executions) {
      const d = new Date(e.startedAt);
      if (d >= weekAgo) {
        const key = `${d.getMonth() + 1}/${d.getDate()}`;
        const day = dailyMap.get(key);
        if (day) {
          if (e.status === 'passed') day.passed++;
          else if (e.status === 'failed') day.failed++;
        }
      }
    }

    return {
      totalRecordings: recordings.length,
      todayExecutions: todayExecutions.length,
      passRate,
      recentFailures: failedExecutions,
      trendData: Array.from(dailyMap.entries()).map(([date, data]) => ({
        date,
        passed: data.passed,
        failed: data.failed,
      })),
    };
  }, [recordings, executions]);

  const activeReplays = Object.values(recordingReplays).filter(r => r.status === 'running');

  // Build lookup maps
  const recordingMap = useMemo(() => {
    const map = new Map<string, Recording>();
    for (const r of recordings) map.set(r.id, r);
    return map;
  }, [recordings]);

  const projectMap = useMemo(() => {
    const map = new Map<string, Project>();
    for (const p of projects) map.set(p.id, p);
    return map;
  }, [projects]);

  function getRecordingDisplayName(recordingId: string): string {
    const rec = recordingMap.get(recordingId);
    if (!rec) return recordingId.slice(0, 8);
    const project = projectMap.get(rec.projectId);
    return project ? `${project.name} — ${rec.title}` : rec.title;
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-zinc-800" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">仪表盘</h1>
        <p className="mt-1 text-sm text-zinc-500">快速了解录制和回放状态。</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="总录制数"
          value={stats.totalRecordings}
        />
        <KpiCard
          label="今日执行"
          value={stats.todayExecutions}
        />
        <KpiCard
          label="通过率"
          value={`${stats.passRate}%`}
          accent={stats.passRate < 80 ? 'text-red-400' : stats.passRate < 95 ? 'text-yellow-400' : 'text-green-400'}
        />
      </div>

      {/* Active replays */}
      {activeReplays.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-300">
            <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
            正在回放 ({activeReplays.length})
          </div>
          <div className="space-y-2">
            {activeReplays.map(r => (
              <Link
                key={r.recordingId}
                to={`/recordings/${r.recordingId}`}
                className="flex cursor-pointer items-center justify-between rounded-md bg-zinc-800/50 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
              >
                <span>{getRecordingDisplayName(r.recordingId)}</span>
                <StatusBadge status="running" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Chart + Failures */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="mb-4 text-sm font-medium text-zinc-300">7 天执行趋势</h2>
          <TrendChart data={stats.trendData} />
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-medium text-zinc-300">
            <AlertCircle className="h-4 w-4 text-red-400" />
            最近失败
          </h2>
          {stats.recentFailures.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-600">暂无失败执行</p>
          ) : (
            <div className="space-y-2">
              {stats.recentFailures.map(ex => (
                <Link
                  key={ex.id}
                  to={`/executions/${ex.id}`}
                  className="block cursor-pointer rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-sm transition-colors hover:bg-red-500/10"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-300">{getRecordingDisplayName(ex.recordingId)}</span>
                    <StatusBadge status="failed" />
                  </div>
                  <p className="mt-1 truncate text-xs text-zinc-600">
                    {new Date(ex.startedAt).toLocaleString()}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${accent ?? 'text-zinc-100'}`}>{value}</p>
    </div>
  );
}
