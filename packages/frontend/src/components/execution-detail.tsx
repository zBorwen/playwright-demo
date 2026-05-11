import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { fetchExecution, fetchExecutionArtifacts, executionTraceUrl } from '@/lib/api';
import type { Execution, ExecutionArtifact } from '@/lib/api';
import { TraceViewerModal } from '@/components/trace-viewer-modal';
import { StatusBadge } from '@/components/status-badge';

export function ExecutionDetail() {
  const { id } = useParams<{ id: string }>();
  const [execution, setExecution] = useState<Execution | null>(null);
  const [artifacts, setArtifacts] = useState<ExecutionArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTrace, setShowTrace] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetchExecution(id),
      fetchExecutionArtifacts(id),
    ]).then(([data, arts]) => {
      setExecution(data);
      setArtifacts(arts);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, [id]);

  if (loading) return <p className="text-zinc-500">加载中...</p>;
  if (!execution) return <p className="text-red-400">执行不存在</p>;

  const duration = execution.finishedAt
    ? ((new Date(execution.finishedAt).getTime() - new Date(execution.startedAt).getTime()) / 1000).toFixed(1)
    : null;

  const screenshots = artifacts.filter((a) => a.type === 'screenshot').sort((a, b) => (a.stepIndex ?? 0) - (b.stepIndex ?? 0));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">执行详情</h1>
        <p className="mt-1 text-sm text-zinc-500 font-mono">{execution.id}</p>
      </div>

      <div className="max-w-2xl space-y-4">
        {/* Status Card */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm text-zinc-400">状态</span>
            <StatusBadge
              status={execution.status === 'passed' ? 'passed' : execution.status === 'failed' ? 'failed' : 'running'}
            />
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-400">开始时间</span>
              <span className="font-mono">{new Date(execution.startedAt).toLocaleString()}</span>
            </div>
            {execution.finishedAt && (
              <>
                <div className="flex justify-between">
                  <span className="text-zinc-400">结束时间</span>
                  <span className="font-mono">{new Date(execution.finishedAt).toLocaleString()}</span>
                </div>
                {duration && (
                  <div className="flex justify-between">
                    <span className="text-zinc-400">耗时</span>
                    <span className="font-mono">{duration}s</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Error */}
        {execution.error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
            <span className="block text-sm font-medium text-red-400">错误信息</span>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-red-300">{execution.error}</pre>
            {execution.status === 'failed' && execution.trace?.includes('trace.zip') && execution.id && (
              <button
                onClick={() => setShowTrace(true)}
                className="mt-3 inline-flex items-center gap-1.5 rounded bg-red-500/20 px-3 py-1.5 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/30"
              >
                <Eye className="h-4 w-4" />
                查看 Trace
              </button>
            )}
          </div>
        )}

        {/* Screenshots */}
        {screenshots.length > 0 && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
            <span className="block text-sm font-medium text-zinc-400">截图 ({screenshots.length})</span>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {screenshots.map((ss, i) => (
                <div key={ss.id} className="overflow-hidden rounded border border-zinc-800">
                  <div className="bg-zinc-800 px-2 py-1 text-xs text-zinc-400">
                    步骤 {ss.stepIndex ?? i + 1}
                  </div>
                  <img
                    src={`/storage/${ss.path}`}
                    alt={`步骤 ${ss.stepIndex ?? i + 1} 截图`}
                    className="w-full"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Trace Viewer Modal */}
      {showTrace && execution?.id && (
        <TraceViewerModal
          traceUrl={executionTraceUrl(execution.id)}
          title={`执行 ${execution.id}`}
          onClose={() => setShowTrace(false)}
        />
      )}
    </div>
  );
}
