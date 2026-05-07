import { type BatchItem } from '@/store/batch-replay-store';

interface BatchReplayPanelProps {
  total: number;
  items: BatchItem[];
  isRunning: boolean;
  passed: number;
  failed: number;
}

function itemBorder(item: BatchItem) {
  switch (item.status) {
    case 'passed': return 'border-green-800 bg-green-950/30';
    case 'failed': return 'border-red-800 bg-red-950/30';
    case 'running': return 'border-yellow-800 bg-yellow-950/20';
    default: return 'border-zinc-800 bg-zinc-900';
  }
}

function itemIcon(item: BatchItem) {
  switch (item.status) {
    case 'passed': return '✓';
    case 'failed': return '✗';
    case 'running': return '⏳';
    default: return '○';
  }
}

export function BatchReplayPanel({ total, items, isRunning, passed, failed }: BatchReplayPanelProps) {
  const progressPercent = total > 0 ? ((passed + failed) / total) * 100 : 0;

  return (
    <div className="my-4 rounded-lg border border-zinc-700 bg-zinc-900">
      {/* Header */}
      <div className="px-4 py-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-medium">批量回放进度</span>
          <span className="text-xs text-zinc-400">
            {isRunning ? (
              <span className="text-yellow-400 animate-pulse">
                已启动 {items.length}/{total} 条
              </span>
            ) : (
              <span className="text-green-400">
                完成 ✓ {passed} 通过 / {failed} 失败
              </span>
            )}
          </span>
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-green-600 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Items */}
      <div className="border-t border-zinc-800 p-3 space-y-1 max-h-[400px] overflow-y-auto">
        {items.map((item) => (
          <div
            key={item.recordingId}
            className={`rounded border px-3 py-2 text-sm transition ${itemBorder(item)}`}
          >
            <div className="flex items-center gap-2">
              <span className={`w-6 text-center text-xs font-mono ${
                item.status === 'passed' ? 'text-green-400' :
                item.status === 'failed' ? 'text-red-400' :
                item.status === 'running' ? 'text-yellow-400' :
                'text-zinc-500'
              }`}>
                {itemIcon(item)}
              </span>
              <span className="font-medium flex-1 truncate">
                {item.recordingTitle || item.recordingId}
              </span>
              {item.executionId && item.status !== 'pending' && (
                <a
                  href={`/executions/${item.executionId}`}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  详情 →
                </a>
              )}
            </div>
            {item.error && (
              <pre className="mt-2 text-xs text-red-400 font-mono whitespace-pre-wrap">{item.error}</pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
