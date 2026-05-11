import { Play, Loader2, CheckCircle, XCircle, Circle, Square } from 'lucide-react';
import { ControlBar } from '@/components/control-bar';
import type { Recording } from '@/lib/api';

const REPLAY_BUTTON_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; text: string; className?: string }> = {
  running: { icon: Loader2, text: '回放中', className: 'animate-spin' },
  passed: { icon: CheckCircle, text: '回放通过' },
  failed: { icon: XCircle, text: '回放失败' },
  idle: { icon: Play, text: '回放' },
};

interface RecordingHeaderProps {
  recording: Recording;
  recordingStatus: 'idle' | 'recording';
  replayStatus: string;
  storeStatus: string | undefined;
  useMock: boolean;
  projectReplaySpeed: 'fast' | 'normal' | 'slow';
  actionsCount: number;
  lastExecutionStatus?: string;
  lastExecutedAt?: string;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onReplay: () => void;
  onUseMockChange: (checked: boolean) => void;
  onSpeedChange: (speed: 'fast' | 'normal' | 'slow') => void;
}

export function RecordingHeader({
  recording,
  recordingStatus,
  replayStatus,
  storeStatus,
  useMock,
  projectReplaySpeed,
  actionsCount,
  lastExecutionStatus,
  lastExecutedAt,
  onStartRecording,
  onStopRecording,
  onReplay,
  onUseMockChange,
  onSpeedChange,
}: RecordingHeaderProps) {
  const replayConfig = REPLAY_BUTTON_CONFIG[replayStatus] ?? REPLAY_BUTTON_CONFIG.idle;
  const ReplayIcon = replayConfig.icon;
  const isRunning = replayStatus === 'running' || storeStatus === 'running';

  return (
    <div className="mb-4 border-b border-zinc-800 pb-4">
      {/* Title row */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-zinc-100">{recording.title}</h1>
          <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
            {recording.targetUrl && (
              <span className="truncate max-w-[400px] font-mono" title={recording.targetUrl}>
                {recording.targetUrl}
              </span>
            )}
            {recording.createdAt && (
              <span>{new Date(recording.createdAt).toLocaleDateString()}</span>
            )}
            <span>{actionsCount} 个操作</span>
          </div>
        </div>
        {/* Execution status badge */}
        {lastExecutionStatus && (
          <div className="flex shrink-0 items-center gap-1.5 rounded-md bg-zinc-800 px-3 py-1.5 text-xs">
            {lastExecutionStatus === 'passed' ? (
              <CheckCircle className="h-3.5 w-3.5 text-green-400" />
            ) : lastExecutionStatus === 'failed' ? (
              <XCircle className="h-3.5 w-3.5 text-red-400" />
            ) : (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
            )}
            <span className={
              lastExecutionStatus === 'passed' ? 'text-green-400'
                : lastExecutionStatus === 'failed' ? 'text-red-400'
                : 'text-blue-400'
            }>
              {lastExecutionStatus === 'passed' ? '通过' : lastExecutionStatus === 'failed' ? '失败' : '执行中'}
            </span>
            {lastExecutedAt && <span className="text-zinc-500">{lastExecutedAt}</span>}
          </div>
        )}
      </div>

      {/* Actions row */}
      <div className="mt-3 flex items-center gap-2">
        {recordingStatus === 'idle' ? (
          <button
            onClick={onStartRecording}
            disabled={storeStatus === 'running'}
            className="inline-flex items-center gap-2 rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Circle className="h-4 w-4 fill-current" /> 录制
          </button>
        ) : (
          <button
            onClick={onStopRecording}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <Square className="h-4 w-4 fill-current" /> 停止
          </button>
        )}
        <button
          onClick={onReplay}
          disabled={isRunning}
          className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            replayStatus === 'passed'
              ? 'border border-green-700 text-green-400 hover:bg-green-900/50'
              : replayStatus === 'failed'
              ? 'border border-red-700 text-red-400 hover:bg-red-900/50'
              : 'border border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
          }`}
        >
          <ReplayIcon className={`h-4 w-4 ${replayConfig.className || ''}`} />
          {replayConfig.text}
        </button>
        {/* Mock & Speed controls */}
        <ControlBar
          mockEnabled={useMock}
          replaySpeed={projectReplaySpeed}
          disabled={isRunning}
          onMockChange={onUseMockChange}
          onSpeedChange={onSpeedChange}
        />
      </div>
    </div>
  );
}
