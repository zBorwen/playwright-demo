import { AlertCircle } from 'lucide-react';
import { ACTION_ICONS, formatActionDetail } from '@/lib/action-formatter';
import type { RecordingAction } from '@/lib/api';
import type { ReplayStep } from '@/components/replay-panel';

interface TimelineStepListProps {
  actions: RecordingAction[];
  steps?: ReplayStep[];
}

export function TimelineStepList({ actions, steps }: TimelineStepListProps) {
  if (actions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <AlertCircle className="mb-3 h-10 w-10 text-zinc-700" />
        <p className="text-sm">暂无操作</p>
        <p className="mt-1 text-xs text-zinc-600">录制后将自动生成操作序列</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {actions.map((action, i) => {
        const detail = formatActionDetail(action);
        const step = steps?.find(s => s.index === i);
        const isError = step?.status === 'failed';

        return (
          <div
            key={i}
            className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
              isError
                ? 'border-red-500/30 bg-red-950/20'
                : 'border-zinc-800/50 bg-zinc-900/30 hover:bg-zinc-800/50'
            }`}
          >
            {/* Step number */}
            <span className="w-6 text-center font-mono text-[10px] text-zinc-600">
              {i + 1}
            </span>
            {/* Action icon */}
            <span className="w-5 text-center text-zinc-400">
              {(() => {
                const Icon = ACTION_ICONS[action.name];
                return Icon ? <Icon className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />;
              })()}
            </span>
            {/* Action name */}
            <span className="font-medium capitalize min-w-[60px] text-zinc-200">{action.name}</span>
            {/* Detail */}
            <span className="text-zinc-400 truncate flex-1 text-xs">{detail}</span>
            {/* Error badge */}
            {isError && step?.error && (
              <span className="shrink-0 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-400 max-w-[150px] truncate" title={step.error}>
                {step.error}
              </span>
            )}
            {/* Timestamp */}
            <span className="text-zinc-600 text-[10px] whitespace-nowrap font-mono">
              {action.timestamp ? new Date(action.timestamp).toLocaleTimeString() : '--:--'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
