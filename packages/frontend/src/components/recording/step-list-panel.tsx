import { useState, memo } from 'react';
import { CheckCircle, XCircle, Circle, Loader2, ChevronDown, ChevronRight, Camera } from 'lucide-react';
import { ACTION_ICONS, formatActionDetail } from '@/lib/action-formatter';
import { useRecordingReplayStore } from '@/store/recording-replay-store';
import { useShallow } from 'zustand/react/shallow';

interface StepListPanelProps {
  recordingId: string;
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

interface StepItemProps {
  recordingId: string;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  expandedStep: number | null;
  setExpandedStep: (i: number | null) => void;
}

const StepItem = memo(({ recordingId, index, isSelected, onSelect, expandedStep, setExpandedStep }: StepItemProps) => {
  const action = useRecordingReplayStore(useShallow(s => s.activeRecordingActions[recordingId]?.[index]));
  const step = useRecordingReplayStore(useShallow(s => s.recordingReplays[recordingId]?.replaySteps?.[index]));

  if (!action) return null;

  const status = step?.status ?? 'pending';
  const isFailed = status === 'failed';
  const isExpanded = expandedStep === index;
  const Icon = ACTION_ICONS[action.name];
  const detail = step?.detail || formatActionDetail(action);

  return (
    <button
      onClick={() => {
        onSelect();
        if (isFailed && !isSelected) setExpandedStep(index);
      }}
      className={`group flex w-full cursor-pointer items-start gap-1.5 px-2.5 py-1.5 text-left transition-colors ${
        isSelected
          ? 'bg-violet-600/10 border-l-2 border-l-violet-500'
          : isFailed
          ? 'cursor-pointer bg-red-950/30 hover:bg-red-950/50'
          : 'hover:bg-zinc-800/50 border-l-2 border-l-transparent'
      }`}
    >
      <div className="mt-0.5 shrink-0">
        {step ? (
          <StepStatusIcon status={status} />
        ) : Icon ? (
          <Icon className="h-3.5 w-3.5 text-zinc-500" />
        ) : (
          <Circle className="h-3 w-3 text-zinc-600" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="font-mono text-[10px] text-zinc-600 w-4 shrink-0">{index + 1}</span>
          <span className="text-[10px] font-medium text-zinc-500 capitalize shrink-0">
            {action.name}
          </span>
          <span className="truncate text-[11px] text-zinc-300 flex-1">
            {detail}
          </span>
          {step?.screenshot && (
            <Camera className="h-3 w-3 text-violet-400 shrink-0 opacity-80" />
          )}
        </div>
      </div>
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
});

export function StepListPanel({ recordingId, isRunning, selectedStep, onSelectStep }: StepListPanelProps) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  const actionsCount = useRecordingReplayStore(s => s.activeRecordingActions[recordingId]?.length || 0);
  
  const { completed, failed, totalSteps } = useRecordingReplayStore(useShallow(s => {
    const steps = s.recordingReplays[recordingId]?.replaySteps || [];
    let completed = 0;
    let failed = 0;
    for (const st of steps) {
      if (st.status === 'completed') completed++;
      if (st.status === 'failed') failed++;
    }
    return { completed, failed, totalSteps: steps.length };
  }));

  if (actionsCount === 0) {
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

  const total = totalSteps || actionsCount;

  return (
    <div className="flex w-52 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/50">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <span className="text-xs font-medium text-zinc-400">
          操作步骤
        </span>
        {isRunning && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {Array.from({ length: actionsCount }).map((_, i) => (
          <StepItem
            key={i}
            recordingId={recordingId}
            index={i}
            isSelected={selectedStep === i}
            onSelect={() => onSelectStep(i)}
            expandedStep={expandedStep}
            setExpandedStep={setExpandedStep}
          />
        ))}
      </div>

      {(totalSteps > 0 || actionsCount > 0) && (
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
