import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchExecution, fetchExecutionArtifacts, executionTraceUrl } from '@/lib/api';
import type { Execution, ExecutionArtifact } from '@/lib/api';

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
  if (!execution) return <p className="text-zinc-500">执行不存在</p>;

  const duration = execution.finishedAt
    ? ((new Date(execution.finishedAt).getTime() - new Date(execution.startedAt).getTime()) / 1000).toFixed(1)
    : null;

  const screenshots = artifacts.filter((a) => a.type === 'screenshot').sort((a, b) => (a.stepIndex ?? 0) - (b.stepIndex ?? 0));

  return (
    <div>
      <div className="mb-6">
        <Link to={`/recordings/${execution.recordingId}`} className="text-sm text-zinc-400 hover:text-zinc-200">
          ← 返回录制
        </Link>
        <h1 className="mt-2 text-2xl font-bold">执行详情</h1>
      </div>

      <div className="max-w-2xl space-y-4">
        {/* Status Card */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm text-zinc-400">状态</span>
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                execution.status === 'passed'
                  ? 'bg-green-900 text-green-300'
                  : execution.status === 'failed'
                    ? 'bg-red-900 text-red-300'
                    : 'bg-yellow-900 text-yellow-300'
              }`}
            >
              {execution.status === 'passed' ? '通过' : execution.status === 'failed' ? '失败' : '运行中'}
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-400">开始时间</span>
              <span>{new Date(execution.startedAt).toLocaleString()}</span>
            </div>
            {execution.finishedAt && (
              <>
                <div className="flex justify-between">
                  <span className="text-zinc-400">结束时间</span>
                  <span>{new Date(execution.finishedAt).toLocaleString()}</span>
                </div>
                {duration && (
                  <div className="flex justify-between">
                    <span className="text-zinc-400">耗时</span>
                    <span>{duration}s</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Error */}
        {execution.error && (
          <div className="rounded-lg border border-red-800 bg-zinc-900 p-4">
            <span className="block text-sm font-medium text-red-400">错误信息</span>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-red-300">{execution.error}</pre>
            {execution.status === 'failed' && execution.trace?.includes('trace.zip') && execution.id && (
              <button
                onClick={() => setShowTrace(true)}
                className="mt-3 inline-block rounded bg-red-900 px-3 py-1.5 text-sm text-red-200 hover:bg-red-800 transition"
              >
                🔍 查看 Trace
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowTrace(false)}>
          <div className="relative h-[90vh] w-[95vw] rounded-lg bg-zinc-900 shadow-xl" onClick={(e) => e.stopPropagation()}>
            {/* Close button */}
            <button
              onClick={() => setShowTrace(false)}
              className="absolute right-3 top-3 z-10 rounded bg-zinc-800 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-700"
            >
              ✕ 关闭
            </button>
            {/* Title */}
            <div className="border-b border-zinc-800 px-4 py-2 text-sm text-zinc-400">
              Trace Viewer — 执行 {execution.id}
            </div>
            {/* iframe */}
            <iframe
              src={`/trace-viewer/index.html?trace=${encodeURIComponent(executionTraceUrl(execution.id))}`}
              className="h-[calc(100%-40px)] w-full rounded-b-lg"
              title="Trace Viewer"
            />
          </div>
        </div>
      )}
    </div>
  );
}
