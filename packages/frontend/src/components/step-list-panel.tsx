import { useState } from 'react';
import { CheckCircle, XCircle, Circle, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { ACTION_ICONS, formatActionDetail } from '@/lib/action-formatter';
import type { RecordingAction } from '@/lib/api';
import type { ReplayStep } from '@/components/replay-panel';

interface StepListPanelProps {
  actions: RecordingAction[];
  steps: ReplayStep[];
  isRunning: boolean;
  selectedStep: number | null;
  onSelectStep: (i: number) => void;
}

function StepStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-3.5 w-3.5 text-green-400 shrink-0" />;
    case 'failed':
      return <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />;
    case 'running':
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400 shrink-0" />;
    case 'skipped':
      return <Circle className="h-3.5 w-3.5 text-zinc-600 shrink-0" />;
    default:
      return <Circle className="h-3 w-3 text-zinc-600 shrink-0" />;
  }
}

export function StepListPanel({ actions, steps, isRunning, selectedStep, onSelectStep }: StepListPanelProps) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  if (actions.length === 0) {
    return (
      <div className="flex w-52 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/50">
        <div className="border-b border-zinc-800 px-3 py-2">
          <span className="text-xs font-medium text-zinc-400">操作步骤</span>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 text-center">
          <div className="text-zinc-600">
            <Circle className="mx-auto mb-2 h-6 w-6" />
            <p className="text-xs">暂无操作</p>
          </div>
        </div>
      </div>
    );
  }

  const completed = steps.filter(s => s.status === 'completed').length;
  const failed = steps.filter(s => s.status === 'failed').length;
  const total = steps.length || actions.length;

  return (
    <div className="flex w-52 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="text-xs font-medium text-zinc-400">
          操作步骤
        </span>
        {isRunning && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
        )}
      </div>

      {/* Step list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {actions.map((action, i) => {
          const step = steps.find(s => s.index === i);
          const status = step?.status ?? 'pending';
          const isFailed = status === 'failed';
          const isExpanded = expandedStep === i;
          const Icon = ACTION_ICONS[action.name];
          const detail = step?.detail || formatActionDetail(action);

          return (
            <button
              key={i}
              onClick={() => {
                onSelectStep(i);
                if (isFailed && selectedStep !== i) setExpandedStep(i);
              }}
              className={`group flex w-full cursor-pointer items-start gap-1.5 px-2.5 py-1.5 text-left transition-colors ${
                selectedStep === i
                  ? 'bg-violet-600/10 border-l-2 border-l-violet-500'
                  : isFailed
                  ? 'cursor-pointer bg-red-950/30 hover:bg-red-950/50'
                  : 'hover:bg-zinc-800/50 border-l-2 border-l-transparent'
              }`}
            >
              {/* Status icon */}
              <div className="mt-0.5 shrink-0">
                {step ? (
                  <StepStatusIcon status={status} />
                ) : Icon ? (
                  <Icon className="h-3.5 w-3.5 text-zinc-500" />
                ) : (
                  <Circle className="h-3 w-3 text-zinc-600" />
                )}
              </div>
              {/* Step info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="font-mono text-[10px] text-zinc-600 w-4 shrink-0">{i + 1}</span>
                  <span className="text-[10px] font-medium text-zinc-500 capitalize shrink-0">
                    {action.name}
                  </span>
                  <span className="truncate text-[11px] text-zinc-300">
                    {detail}
                  </span>
                </div>
              </div>
              {/* Expand indicator for failed steps */}
              {isFailed && (
                <div className="mt-0.5 shrink-0 text-zinc-500">
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer: progress stats */}
      {steps.length > 0 && (
        <div className="border-t border-zinc-800 px-3 py-2">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-zinc-500">
              {completed}/{total} 完成
            </span>
            {failed > 0 && (
              <span className="text-red-400">
                {failed} 失败
              </span>
            )}
          </div>
          {/* Progress bar */}
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={`h-full rounded-full transition-all ${
                failed > 0 ? 'bg-red-500' : 'bg-green-500'
              }`}
              style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
