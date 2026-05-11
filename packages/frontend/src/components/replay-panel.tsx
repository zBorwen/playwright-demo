import { StatusIcon } from '@/components/status-badge';
import type { StatusType } from '@/components/status-badge';

export interface ReplayStep {
  index: number;
  actionName: string;
  detail: string;
  status: 'pending' | 'completed' | 'failed' | 'skipped';
  error?: string;
}

interface ReplayPanelProps {
  steps: ReplayStep[];
  isRunning: boolean;
  overallStatus: 'idle' | 'running' | 'passed' | 'failed';
  executionId?: string | null;
  onViewTrace?: (executionId: string) => void;
}

function statusType(step: ReplayStep): StatusType {
  switch (step.status) {
    case 'completed': return 'passed';
    case 'failed': return 'failed';
    case 'skipped': return 'pending';
    default: return 'pending';
  }
}

function statusBorder(step: ReplayStep) {
  switch (step.status) {
    case 'completed': return 'border-green-800 bg-green-950/30';
    case 'failed': return 'border-red-800 bg-red-950/30';
    case 'skipped': return 'border-zinc-800 bg-zinc-900/50 text-zinc-600';
    default: return 'border-zinc-800 bg-zinc-900';
  }
}

export function ReplayPanel({ steps, isRunning, overallStatus, executionId, onViewTrace }: ReplayPanelProps) {
  if (steps.length === 0) return null;

  const failedStep = steps.find(s => s.status === 'failed');
  const completedCount = steps.filter(s => s.status === 'completed').length;

  return (
    <div className="my-4 rounded-lg border border-zinc-700 bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 text-sm">
        <div className="flex items-center gap-3">
          <span className="font-medium">回放进度</span>
          {isRunning && (
            <span className="text-xs text-yellow-400 animate-pulse">
              {completedCount}/{steps.length} 完成
            </span>
          )}
          {!isRunning && overallStatus === 'passed' && (
            <span className="text-xs text-green-400">全部通过 ({steps.length} 步)</span>
          )}
          {!isRunning && overallStatus === 'failed' && (
            <span className="text-xs text-red-400">失败于步骤 {failedStep ? failedStep.index + 1 : '未知'}</span>
          )}
        </div>
      </div>

      {/* Steps */}
      <div className="border-t border-zinc-800 p-3 space-y-1 max-h-[400px] overflow-y-auto">
        {steps.map((step) => (
          <div
            key={step.index}
            className={`rounded border px-3 py-2 text-sm transition ${statusBorder(step)}`}
          >
            <div className="flex items-center gap-2">
              <span className="w-6 text-center text-xs">
                <StatusIcon status={statusType(step)} />
              </span>
              <span className="w-6 text-right text-zinc-500 text-xs">{step.index + 1}</span>
              <span className="font-medium capitalize min-w-[80px]">{step.actionName}</span>
              <span className="text-zinc-400 truncate">{step.detail}</span>
            </div>
            {step.error && (
              <pre className="mt-2 ml-14 text-xs text-red-400 font-mono whitespace-pre-wrap bg-red-950/50 rounded px-2 py-1">{step.error}</pre>
            )}
          </div>
        ))}
      </div>

      {/* Error summary */}
      {!isRunning && failedStep && (
        <div className="border-t border-zinc-800 px-4 py-3 space-y-2">
          <div className="text-sm text-red-400">
            <span className="font-medium">失败原因: </span>
            <span>{failedStep.error || `步骤 ${failedStep.index + 1} (${failedStep.actionName}) 执行失败`}</span>
          </div>
          {executionId && onViewTrace && (
            <button
              onClick={() => onViewTrace(executionId!)}
              className="inline-block rounded bg-red-900 px-3 py-1.5 text-sm text-red-200 hover:bg-red-800 transition"
            >
              🔍 查看 Trace
            </button>
          )}
        </div>
      )}
    </div>
  );
}
