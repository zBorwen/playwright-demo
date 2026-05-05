import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  fetchRecording,
  fetchRecordingActions,
  fetchRecordingCodegen,
  fetchExecutions,
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
import { useWebSocket } from '@/hooks/use-websocket';
import { RecordingJsonEditor } from '@/components/recording-json-editor';
import { NetworkTab } from '@/components/network-tab';
import { ReplayPanel, type ReplayStep } from '@/components/replay-panel';
import { BatchReplayPanel, type BatchReplayItem } from '@/components/batch-replay-panel';

const ACTION_ICONS: Record<string, string> = {
  click: '👆',
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

type Tab = 'timeline' | 'codegen' | 'network' | 'json' | 'executions';

function formatActionDetail(action: RecordingAction): string {
  const parts: string[] = [];

  // Selector-based actions
  if ('selector' in action && action.selector) {
    parts.push(action.selector);
  }

  // Action-specific details
  switch (action.name) {
    case 'fill':
      if (action.value) parts.push(`"${truncate(action.value, 30)}"`);
      break;
    case 'press':
      if (action.key) parts.push(`key: ${action.key}`);
      break;
    case 'select':
      if (action.options?.length) parts.push(`options: ${action.options.join(', ')}`);
      break;
    case 'click':
      if (action.button && action.button !== 'left') parts.push(`${action.button} click`);
      if (action.modifiers) parts.push(`modifiers: ${action.modifiers}`);
      break;
    case 'navigate':
      if (action.url) parts.push(action.url);
      break;
    case 'assertText':
      if (action.text) parts.push(`text: "${truncate(action.text, 30)}"`);
      break;
    case 'assertChecked':
      parts.push(`checked: ${action.checked}`);
      break;
    case 'assertValue':
      if (action.value) parts.push(`value: "${truncate(action.value, 30)}"`);
      break;
    case 'setInputFiles':
      if (action.files?.length) parts.push(`files: ${action.files.join(', ')}`);
      break;
  }

  // Element info hint
  if (action.elementInfo?.role) {
    parts.unshift(`[${action.elementInfo.role}]`);
  }

  return parts.join(' ');
}

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len) + '...' : s;
}

export function RecordingDetail() {
  const { id } = useParams<{ id: string }>();
  const [recording, setRecording] = useState<Recording | null>(null);
  const [actions, setActions] = useState<RecordingAction[]>([]);
  const actionsRef = useRef<RecordingAction[]>([]);

  // Keep ref in sync with state
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
  const [showTrace, setShowTrace] = useState(false);
  const [useMock, setUseMock] = useState(false);
  const [projectReplaySpeed, setProjectReplaySpeed] = useState<'fast' | 'normal' | 'slow'>('normal');
  const [project, setProject] = useState<{ id: string; name: string; replaySpeed: 'fast' | 'normal' | 'slow' } | null>(null);
  const [codegen, setCodegen] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [batchReplayState, setBatchReplayState] = useState<{
    batchId: string;
    items: BatchReplayItem[];
    isRunning: boolean;
    passed: number;
    failed: number;
  } | null>(null);

  const handleWsMessage = useCallback((msg: { type: string; payload: unknown }) => {
    switch (msg.type) {
      case 'record:action': {
        const payload = msg.payload as { action: RecordingAction; code?: string };

        const action = payload.action;
        const currentActions = actionsRef.current;

        if (action.name === 'fill' && 'selector' in action && action.selector) {
          const selector = action.selector;
          // Only dedup if the last action is also a fill with the same selector (same typing session)
          const lastAction = currentActions.length > 0 ? currentActions[currentActions.length - 1] : null;
          const shouldUpdate = lastAction?.name === 'fill' && 'selector' in lastAction && lastAction.selector === selector;

          if (shouldUpdate) {
            // Update last fill (same typing session)
            const updated = [...currentActions];
            updated[updated.length - 1] = action;
            actionsRef.current = updated;
            setActions(updated);
          } else {
            // New typing session — append as new fill
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
          // Auto-save actions to server
          if (id && payload.actions.length > 0) {
            saveRecordingActions(id, payload.actions).catch((e) => {
              console.error('Failed to auto-save recording actions:', e);
            });
          }
        }
        // Fetch codegen from server on completion
        if (id) {
          fetchRecordingCodegen(id).then((r) => setCodegen(r.codegen || '')).catch((e) => {
            console.warn('Failed to fetch codegen:', e.message);
          });
        }
        break;
      }
      case 'replay:step': {
        const stepPayload = msg.payload as { index: number; executionId: string; status: 'completed' | 'failed'; error?: string };
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
        const payload = msg.payload as { status: 'passed' | 'failed'; error?: string; trace?: string };
        setReplayStatus(payload.status);
        if (payload.status === 'failed') {
          // Mark remaining steps as skipped
          setReplaySteps((prev) =>
            prev.map((s) =>
              s.status === 'pending' ? { ...s, status: 'skipped' as const } : s
            )
          );
        } else {
          // On success, mark all pending steps as completed
          setReplaySteps((prev) =>
            prev.map((s) =>
              s.status === 'pending' ? { ...s, status: 'completed' as const } : s
            )
          );
        }
        if (id) fetchExecutions(id).then((e) => setExecutions(e));
        break;
      }
      case 'batch-replay:result': {
        const p = msg.payload as { recordingId: string; status: 'passed' | 'failed' | 'running' | 'pending'; error?: string; executionId?: string };
        setBatchReplayState(prev => {
          if (!prev) return prev;
          const idx = prev.items.findIndex(i => i.recordingId === p.recordingId);
          if (idx < 0) return prev;
          const updated = [...prev.items];
          updated[idx] = { ...updated[idx], status: p.status, error: p.error, executionId: p.executionId };
          const passed = updated.filter(i => i.status === 'passed').length;
          const failed = updated.filter(i => i.status === 'failed').length;
          return { ...prev, items: updated, passed, failed, isRunning: passed + failed < prev.items.length };
        });
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
      // Fetch project for replay speed
      if (rec.projectId) {
        fetchProject(rec.projectId).then((p) => {
          setProject(p);
          setProjectReplaySpeed(p.replaySpeed || 'normal');
        }).catch(() => {});
      }
    }).catch((e) => {
      setLoadError(e.message);
      setLoading(false);
    });
  }, [id]);

  const handleStartRecording = async () => {
    // Clear old actions and codegen before starting new recording
    setActions([]);
    actionsRef.current = [];
    setCodegen('');
    await startRecording(id!);
    setRecordingStatus('recording');
  };

  const handleStopRecording = async () => {
    await stopRecording(id!);
    setRecordingStatus('idle');
    // Actions will be updated via record:complete WS message
    // But if WS is slow, fetch as fallback after a short delay
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

      {/* Replay Panel */}
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

      {/* Batch Replay Panel */}
      {batchReplayState && batchReplayState.items.length > 0 && (
        <BatchReplayPanel
          total={batchReplayState.items.length}
          items={batchReplayState.items}
          isRunning={batchReplayState.isRunning}
          passed={batchReplayState.passed}
          failed={batchReplayState.failed}
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
