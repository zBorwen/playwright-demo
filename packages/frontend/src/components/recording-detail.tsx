import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  fetchRecording,
  fetchRecordingActions,
  fetchRecordingCodegen,
  fetchExecutions,
  fetchExecution,
  fetchProject,
  updateProjectSettings,
  startRecording,
  stopRecording,
  replayRecording,
  saveRecordingActions,
  executionTraceUrl,
  type Recording,
  type Execution,
  type RecordingAction,
} from '@/lib/api';
import { useWebSocket, getSingleReplayProgress } from '@/hooks/use-websocket';
import { RecordingJsonEditor } from '@/components/recording-json-editor';
import { NetworkTab } from '@/components/network-tab';
import { ReplayPanel, type ReplayStep } from '@/components/replay-panel';
import { detectRunningExecution } from '@/lib/replay-state';
import { ACTION_ICONS, formatActionDetail } from '@/lib/action-formatter';

type Tab = 'timeline' | 'codegen' | 'network' | 'json' | 'executions';

export function RecordingDetail() {
  const { id } = useParams<{ id: string }>();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [actions, setActions] = useState<RecordingAction[]>([]);
  const actionsRef = useRef<RecordingAction[]>([]);

  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('timeline');
  const [recordingStatus, setRecordingStatus] = useState<'idle' | 'recording'>('idle');
  const [replayStatus, setReplayStatus] = useState<'idle' | 'running' | 'passed' | 'failed'>('idle');
  const [replaySteps, setReplaySteps] = useState<ReplayStep[]>([]);
  const [replayExecutionId, setReplayExecutionId] = useState<string | null>(null);
  const replayExecutionIdRef = useRef<string | null>(null);

  useEffect(() => {
    replayExecutionIdRef.current = replayExecutionId;
  }, [replayExecutionId]);
  const [showTrace, setShowTrace] = useState(false);
  const [useMock, setUseMock] = useState(false);
  const [projectReplaySpeed, setProjectReplaySpeed] = useState<'fast' | 'normal' | 'slow'>('normal');
  const [project, setProject] = useState<{ id: string; name: string; replaySpeed: 'fast' | 'normal' | 'slow' } | null>(null);
  const [codegen, setCodegen] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const handleWsMessage = useCallback((msg: { type: string; payload: unknown }) => {
    switch (msg.type) {
      case 'record:action': {
        const payload = msg.payload as { action: RecordingAction; code?: string };
        const action = payload.action;
        const currentActions = actionsRef.current;

        if (action.name === 'fill' && 'selector' in action && action.selector) {
          const selector = action.selector;
          const lastAction = currentActions.length > 0 ? currentActions[currentActions.length - 1] : null;
          const shouldUpdate = lastAction?.name === 'fill' && 'selector' in lastAction && lastAction.selector === selector;

          if (shouldUpdate) {
            const updated = [...currentActions];
            updated[updated.length - 1] = action;
            actionsRef.current = updated;
            setActions(updated);
          } else {
            const newActions = [...currentActions, action];
            actionsRef.current = newActions;
            setActions(newActions);
          }
        } else {
          const newActions = [...currentActions, action];
          actionsRef.current = newActions;
          setActions(newActions);
        }

        if (payload.code) {
          setCodegen((prev) => prev ? prev + '\n' + payload.code! : payload.code!);
        }
        break;
      }
      case 'record:complete': {
        setRecordingStatus('idle');
        const payload = msg.payload as { actions?: RecordingAction[]; codegen?: string };
        if (payload.actions) {
          setActions(payload.actions);
          if (id && payload.actions.length > 0) {
            saveRecordingActions(id, payload.actions).catch((e) => {
              console.error('Failed to auto-save recording actions:', e);
            });
          }
        }
        if (id) {
          fetchRecordingCodegen(id).then((r) => setCodegen(r.codegen || '')).catch((e) => {
            console.warn('Failed to fetch codegen:', e.message);
          });
        }
        break;
      }
      case 'replay:step': {
        const stepPayload = msg.payload as { index: number; executionId: string; recordingId: string; status: 'completed' | 'failed'; error?: string };
        // Ignore messages for a different recording
        if (stepPayload.recordingId && id && stepPayload.recordingId !== id) return;
        // Ignore messages for a different execution (e.g. batch replay of other recordings)
        if (stepPayload.executionId && replayExecutionIdRef.current && stepPayload.executionId !== replayExecutionIdRef.current) return;
        if (stepPayload.executionId) setReplayExecutionId(stepPayload.executionId);
        setReplayStatus('running');
        setReplaySteps((prev) =>
          prev.map((s) =>
            s.index === stepPayload.index
              ? { ...s, status: stepPayload.status, error: stepPayload.error ?? s.error }
              : s
          )
        );
        break;
      }
      case 'replay:done': {
        const payload = msg.payload as { status: 'passed' | 'failed'; error?: string; trace?: string; executionId?: string; recordingId?: string };
        // Ignore messages for a different recording
        if (payload.recordingId && id && payload.recordingId !== id) return;
        // Ignore messages for a different execution
        if (payload.executionId && replayExecutionIdRef.current && payload.executionId !== replayExecutionIdRef.current) return;
        setReplayStatus(payload.status);
        if (payload.status === 'failed') {
          setReplaySteps((prev) =>
            prev.map((s) =>
              s.status === 'pending' ? { ...s, status: 'skipped' as const } : s
            )
          );
        } else {
          setReplaySteps((prev) =>
            prev.map((s) =>
              s.status === 'pending' ? { ...s, status: 'completed' as const } : s
            )
          );
        }
        if (id) fetchExecutions(id).then((e) => setExecutions(e));
        break;
      }
    }
  }, [id]);

  useWebSocket(handleWsMessage);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetchRecording(id),
      fetchRecordingActions(id).catch(() => ({ actions: [] })),
      fetchExecutions(id),
      fetchRecordingCodegen(id).catch(() => ({ codegen: '' })),
    ]).then(([rec, acts, execs, codegenResp]) => {
      setRecording(rec);
      setActions(acts.actions || []);
      setExecutions(execs);
      setCodegen(codegenResp.codegen || '');
      setLoading(false);
      if (rec.projectId) {
        fetchProject(rec.projectId).then((p) => {
          setProject(p);
          setProjectReplaySpeed(p.replaySpeed || 'normal');
        }).catch(() => {});
      }
      const restored = detectRunningExecution(execs, acts.actions || []);
      if (restored) {
        const maxCompleted = getSingleReplayProgress(restored.executionId);
        const steps = restored.steps.map(s =>
          maxCompleted >= 0 && s.index <= maxCompleted
            ? { ...s, status: 'completed' as const }
            : s,
        );
        setReplayExecutionId(restored.executionId);
        setReplayStatus('running');
        setReplaySteps(steps);
      }
    }).catch((e) => {
      setLoadError(e.message);
      setLoading(false);
    });
  }, [id]);

  // Fallback: if we restored a running execution but agent already finished,
  // poll once after 2s to get the final state
  useEffect(() => {
    if (!replayExecutionId || replayStatus !== 'running') return;
    const timer = setTimeout(() => {
      fetchExecution(replayExecutionId).then((ex) => {
        if (ex.status !== 'running') {
          setReplayStatus(ex.status);
          setReplaySteps((prev) =>
            prev.map((s) =>
              s.status === 'pending'
                ? { ...s, status: ex.status === 'passed' ? 'completed' as const : 'skipped' as const }
                : s
            )
          );
        }
      }).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, [replayExecutionId, replayStatus]);

  const handleStartRecording = async () => {
    setActions([]);
    actionsRef.current = [];
    setCodegen('');
    await startRecording(id!);
    setRecordingStatus('recording');
  };

  const handleStopRecording = async () => {
    await stopRecording(id!);
    setRecordingStatus('idle');
    setTimeout(async () => {
      if (actions.length === 0 && id) {
        const acts = await fetchRecordingActions(id).catch(() => ({ actions: [] }));
        setActions(acts.actions || []);
      }
    }, 1000);
  };

  const handleReplay = async () => {
    setReplayStatus('running');
    setReplaySteps(actions.map((a, i) => ({
      index: i,
      actionName: a.name,
      detail: formatActionDetail(a),
      status: 'pending' as const,
    })));
    await replayRecording(id!, { useMock, replaySpeed: projectReplaySpeed });
    const execs = await fetchExecutions(id!);
    setExecutions(execs);
  };

  const handleJsonSave = async () => {
    if (id) {
      const acts = await fetchRecordingActions(id);
      setActions(acts.actions || []);
    }
  };

  const handleCopyCodegen = async () => {
    await navigator.clipboard.writeText(codegen);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <div className="text-zinc-500">加载中...</div>;
  if (loadError) return <div className="text-red-400">加载失败: {loadError}</div>;
  if (!recording) return <div className="text-zinc-500">录制不存在</div>;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'timeline', label: '操作序列' },
    { key: 'codegen', label: 'Codegen' },
    { key: 'network', label: 'Network' },
    { key: 'json', label: 'JSON 编辑' },
    { key: 'executions', label: '执行历史' },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <Link to={`/projects/${recording.projectId}`} className="text-sm text-zinc-400 hover:text-zinc-200">← 返回</Link>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{recording.title}</h1>
            <p className="text-sm text-zinc-400">{recording.targetUrl}</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm text-zinc-400">
              <input
                type="checkbox"
                checked={useMock}
                onChange={(e) => setUseMock(e.target.checked)}
                className="rounded border-zinc-600 bg-zinc-800"
              />
              Mock 模式
            </label>
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
            <div className="flex items-center gap-1">
              <button
                onClick={handleReplay}
                disabled={replayStatus === 'running'}
                className="rounded bg-green-900 px-4 py-2 text-sm hover:bg-green-800 disabled:opacity-50"
              >
                {replayStatus === 'running' ? '⏳ 回放中' : replayStatus === 'passed' ? '✅ 通过' : replayStatus === 'failed' ? '❌ 失败' : '▶ 回放'}
              </button>
              <select
                value={projectReplaySpeed}
                onChange={(e) => {
                  const newSpeed = e.target.value as 'fast' | 'normal' | 'slow';
                  setProjectReplaySpeed(newSpeed);
                  if (project) {
                    updateProjectSettings(project.id, { replaySpeed: newSpeed }).catch(() => {});
                  }
                }}
                className="rounded border-zinc-600 bg-zinc-800 text-xs px-1 py-2"
                title="回放速度（保存到项目）"
              >
                <option value="fast">快</option>
                <option value="normal">中</option>
                <option value="slow">慢</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Single Replay Panel */}
      {replaySteps.length > 0 && (
        <ReplayPanel
          steps={replaySteps}
          isRunning={replayStatus === 'running'}
          overallStatus={replayStatus}
          executionId={replayExecutionId}
          onViewTrace={(execId) => {
            setReplayExecutionId(execId);
            setShowTrace(true);
          }}
        />
      )}

      {/* Tabs */}
      <div className="mb-4 flex gap-4 border-b border-zinc-800">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`border-b-2 px-3 py-2 text-sm transition ${
              activeTab === tab.key
                ? 'border-zinc-300 text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
            {tab.key === 'timeline' && (
              <span className="ml-1 text-xs text-zinc-500">({actions.length})</span>
            )}
            {tab.key === 'executions' && (
              <span className="ml-1 text-xs text-zinc-500">({executions.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'timeline' && (
        <div className="space-y-1">
          {actions.length === 0 ? (
            <p className="py-8 text-center text-zinc-500">暂无操作</p>
          ) : (
            actions.map((action, i) => {
              const detail = formatActionDetail(action);
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm"
                >
                  <span className="w-8 text-right text-zinc-500">{i + 1}</span>
                  <span className="text-lg">{ACTION_ICONS[action.name] || '❓'}</span>
                  <span className="font-medium capitalize min-w-[80px]">{action.name}</span>
                  <span className="text-zinc-400 truncate flex-1">{detail}</span>
                  <span className="text-zinc-600 text-xs whitespace-nowrap">
                    {action.timestamp ? new Date(action.timestamp).toLocaleTimeString() : '--:--:--'}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'codegen' && (
        <div>
          {codegen.length === 0 ? (
            <p className="py-8 text-center text-zinc-500">暂无生成代码</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">生成的 Playwright 代码</span>
                <button
                  onClick={handleCopyCodegen}
                  className="rounded bg-zinc-700 px-3 py-1 text-sm hover:bg-zinc-600"
                >
                  {copied ? '已复制 ✓' : '复制'}
                </button>
              </div>
              <pre className="overflow-auto rounded border border-zinc-800 bg-zinc-950 p-4 text-sm font-mono text-zinc-300">
                {codegen}
              </pre>
            </div>
          )}
        </div>
      )}

      {activeTab === 'network' && id && <NetworkTab recordingId={id} />}

      {activeTab === 'json' && (
        <RecordingJsonEditor
          recordingId={id!}
          actions={actions}
          onSave={handleJsonSave}
        />
      )}

      {activeTab === 'executions' && (
        <div>
          {executions.length === 0 ? (
            <p className="text-zinc-500">暂无执行记录</p>
          ) : (
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
          )}
        </div>
      )}

      {/* Trace Viewer Modal */}
      {showTrace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowTrace(false)}>
          <div className="relative h-[90vh] w-[95vw] rounded-lg bg-zinc-900 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowTrace(false)}
              className="absolute right-3 top-3 z-10 rounded bg-zinc-800 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-700"
            >
              ✕ 关闭
            </button>
            <div className="border-b border-zinc-800 px-4 py-2 text-sm text-zinc-400">
              Trace Viewer — 执行 {replayExecutionId}
            </div>
            <iframe
              src={`/trace-viewer/index.html?trace=${replayExecutionId ? encodeURIComponent(executionTraceUrl(replayExecutionId)) : ''}`}
              className="h-[calc(100%-40px)] w-full rounded-b-lg"
              title="Trace Viewer"
            />
          </div>
        </div>
      )}
    </div>
  );
}
