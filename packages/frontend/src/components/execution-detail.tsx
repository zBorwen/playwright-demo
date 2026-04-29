import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchExecution } from '@/lib/api';
import type { Execution } from '@/lib/api';

export function ExecutionDetail() {
  const { id } = useParams<{ id: string }>();
  const [execution, setExecution] = useState<Execution | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchExecution(id)
      .then((data) => {
        setExecution(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [id]);

  if (loading) return <p className="text-zinc-500">加载中...</p>;
  if (!execution) return <p className="text-zinc-500">执行不存在</p>;

  return (
    <div>
      <div className="mb-6">
        <Link to={`/recordings/${execution.recordingId}`} className="text-sm text-zinc-400 hover:text-zinc-200">
          ← 返回录制
        </Link>
        <h1 className="mt-2 text-2xl font-bold">执行详情</h1>
      </div>

      <div className="max-w-2xl space-y-4">
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
              {execution.status}
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-400">开始时间</span>
              <span>{new Date(execution.startedAt).toLocaleString()}</span>
            </div>
            {execution.finishedAt && (
              <div className="flex justify-between">
                <span className="text-zinc-400">结束时间</span>
                <span>{new Date(execution.finishedAt).toLocaleString()}</span>
              </div>
            )}
            {execution.error && (
              <div className="rounded border border-red-800 bg-red-950 p-3 text-red-300">
                <span className="block text-xs text-red-400">错误信息</span>
                <span className="mt-1 block">{execution.error}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
