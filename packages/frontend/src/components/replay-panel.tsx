import { useState, useEffect } from 'react';
import { fetchExecution, type Execution } from '@/lib/api';

interface ReplayStep {
  index: number;
  actionName: string;
  detail: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
}

interface ReplayPanelProps {
  executionId: string | null;
  actions: Array<{ name: string; selector?: string; url?: string; value?: string; text?: string }>;
  isRunning: boolean;
}

export function ReplayPanel({ executionId, actions, isRunning }: ReplayPanelProps) {
  const [execution, setExecution] = useState<Execution | null>(null);
  const [steps, setSteps] = useState<ReplayStep[]>([]);
  const [expanded, setExpanded] = useState(true);

  // Initialize steps from actions
  useEffect(() => {
    setSteps(
      actions.map((a, i) => ({
        index: i,
        actionName: a.name,
        detail: formatDetail(a),
        status: 'pending' as const,
      }))
    );
  }, [actions]);

  // Poll execution for final status
  useEffect(() => {
    if (!executionId || isRunning) return;
    fetchExecution(executionId).then(setExecution).catch(() => {});
  }, [executionId, isRunning]);

  const statusIcon = (step: ReplayStep) => {
    switch (step.status) {
      case 'completed': return '✅';
      case 'running': return '⏳';
      case 'failed': return '❌';
      default: return '⬜';
    }
  };

  const statusColor = (step: ReplayStep) => {
    switch (step.status) {
      case 'completed': return 'border-green-800 bg-green-950/30';
      case 'running': return 'border-yellow-800 bg-yellow-950/30 ring-1 ring-yellow-700';
      case 'failed': return 'border-red-800 bg-red-950/30';
      default: return 'border-zinc-800 bg-zinc-900';
    }
  };

  if (steps.length === 0) return null;

  const failedStep = steps.find(s => s.status === 'failed');

  return (
    <div className="my-4 rounded-lg border border-zinc-700 bg-zinc-900">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm"
      >
        <div className="flex items-center gap-3">
          <span className="font-medium">回放步骤</span>
          {isRunning && <span className="text-xs text-yellow-400 animate-pulse">运行中...</span>}
          {!isRunning && execution?.status === 'passed' && <span className="text-xs text-green-400">通过</span>}
          {!isRunning && execution?.status === 'failed' && <span className="text-xs text-red-400">失败</span>}
        </div>
        <span className="text-zinc-500">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="border-t border-zinc-800 p-3 space-y-1 max-h-[400px] overflow-y-auto">
          {steps.map((step) => (
            <div
              key={step.index}
              className={`rounded border px-3 py-2 text-sm transition ${statusColor(step)}`}
            >
              <div className="flex items-center gap-2">
                <span className="w-5 text-center">{statusIcon(step)}</span>
                <span className="w-6 text-right text-zinc-500 text-xs">{step.index + 1}</span>
                <span className="font-medium min-w-[80px]">{step.actionName}</span>
                <span className="text-zinc-400 truncate">{step.detail}</span>
              </div>
              {step.error && (
                <pre className="mt-1 ml-11 text-xs text-red-400 font-mono whitespace-pre-wrap">{step.error}</pre>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Error summary for failed replays */}
      {!isRunning && failedStep && (
        <div className="border-t border-zinc-800 px-4 py-3">
          <div className="text-sm text-red-400">
            <span className="font-medium">失败原因: </span>
            <span>{failedStep.error || `步骤 ${failedStep.index + 1} (${failedStep.actionName}) 执行失败`}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDetail(action: { name: string; selector?: string; url?: string; value?: string; text?: string }): string {
  switch (action.name) {
    case 'navigate': return action.url ?? '';
    case 'fill': return `"${action.value ?? ''}"`;
    case 'press': return `key: ${action.value ?? action.selector ?? ''}`;
    case 'click': return action.selector ?? '';
    case 'assertText': return `text: "${action.text ?? ''}"`;
    default: return action.selector ?? '';
  }
}
