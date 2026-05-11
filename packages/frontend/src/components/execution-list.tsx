import { Link } from 'react-router-dom';
import type { Execution } from '@/lib/api';

interface ExecutionListProps {
  executions: Execution[];
}

export function ExecutionList({ executions }: ExecutionListProps) {
  if (executions.length === 0) {
    return <p className="text-zinc-500">暂无执行记录</p>;
  }

  return (
    <div className="space-y-2">
      {executions.map((ex) => (
        <Link
          key={ex.id}
          to={`/executions/${ex.id}`}
          className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm transition hover:border-zinc-600"
        >
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              ex.status === 'passed'
                ? 'bg-green-900 text-green-300'
                : ex.status === 'failed'
                  ? 'bg-red-900 text-red-300'
                  : 'bg-yellow-900 text-yellow-300'
            }`}
          >
            {ex.status === 'passed' ? '通过' : ex.status === 'failed' ? '失败' : '运行中'}
          </span>
          <span className="text-zinc-400">
            {new Date(ex.startedAt).toLocaleString()}
          </span>
          {ex.finishedAt && (
            <span className="text-zinc-500">
              → {new Date(ex.finishedAt).toLocaleTimeString()}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
