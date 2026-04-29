import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  fetchRecording,
  fetchRecordingActions,
  fetchExecutions,
  startRecording,
  stopRecording,
  replayRecording,
  type Recording,
  type Execution,
} from '@/lib/api';

const ACTION_ICONS: Record<string, string> = {
  click: '🖱️',
  fill: '⌨️',
  navigate: '🔗',
  hover: '👆',
  press: '⌨️',
  select: '📋',
  check: '☑️',
  uncheck: '☐',
  assertVisible: '👁️',
  assertText: '📝',
  assertChecked: '☑️',
  assertValue: '📊',
  setInputFiles: '📁',
};

export function RecordingDetail() {
  const { id } = useParams<{ id: string }>();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [actions, setActions] = useState<{ name: string; selector?: string; url?: string; text?: string }[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordingStatus, setRecordingStatus] = useState<'idle' | 'recording'>('idle');

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetchRecording(id),
      fetchRecordingActions(id),
      fetchExecutions(id),
    ]).then(([rec, acts, execs]) => {
      setRecording(rec);
      setActions(acts.actions || []);
      setExecutions(execs);
      setLoading(false);
    });
  }, [id]);

  if (loading) return <div className="text-zinc-500">加载中...</div>;
  if (!recording) return <div className="text-zinc-500">录制不存在</div>;

  const handleStartRecording = async () => {
    await startRecording(id!);
    setRecordingStatus('recording');
  };

  const handleStopRecording = async () => {
    await stopRecording(id!);
    setRecordingStatus('idle');
    const acts = await fetchRecordingActions(id!);
    setActions(acts.actions || []);
  };

  const handleReplay = async () => {
    await replayRecording(id!);
    const execs = await fetchExecutions(id!);
    setExecutions(execs);
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link to="/" className="text-sm text-zinc-400 hover:text-zinc-200">← 返回</Link>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{recording.title}</h1>
            <p className="text-sm text-zinc-400">{recording.targetUrl}</p>
          </div>
          <div className="flex gap-2">
            {recordingStatus === 'idle' ? (
              <button
                onClick={handleStartRecording}
                className="rounded bg-red-900 px-4 py-2 text-sm hover:bg-red-800"
              >
                ⏺ 录制
              </button>
            ) : (
              <button
                onClick={handleStopRecording}
                className="rounded bg-zinc-700 px-4 py-2 text-sm hover:bg-zinc-600"
              >
                ⏹ 停止
              </button>
            )}
            <button
              onClick={handleReplay}
              className="rounded bg-green-900 px-4 py-2 text-sm hover:bg-green-800"
            >
              ▶ 回放
            </button>
          </div>
        </div>
      </div>

      {/* Action Timeline */}
      <div className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">操作序列 ({actions.length})</h2>
        <div className="space-y-1">
          {actions.map((action, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm"
            >
              <span className="w-8 text-right text-zinc-500">{i + 1}</span>
              <span className="text-lg">{ACTION_ICONS[action.name] || '❓'}</span>
              <span className="font-medium capitalize">{action.name}</span>
              {action.selector && <span className="text-zinc-400">{action.selector}</span>}
              {action.url && <span className="text-zinc-400">{action.url}</span>}
              {action.text && (
                <span className="text-zinc-400">
                  &quot;{action.text.slice(0, 30)}{action.text.length > 30 ? '...' : ''}&quot;
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Execution History */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">执行历史</h2>
        {executions.length === 0 ? (
          <p className="text-zinc-500">暂无执行记录</p>
        ) : (
          <div className="space-y-2">
            {executions.map((ex) => (
              <div
                key={ex.id}
                className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm"
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
                  {ex.status}
                </span>
                <span className="text-zinc-400">
                  {new Date(ex.startedAt).toLocaleString()}
                </span>
                {ex.finishedAt && (
                  <span className="text-zinc-500">
                    → {new Date(ex.finishedAt).toLocaleTimeString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
