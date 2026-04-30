import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  fetchRecording,
  fetchRecordingActions,
  fetchRecordingCodegen,
  fetchExecutions,
  startRecording,
  stopRecording,
  replayRecording,
  saveRecordingActions,
  type Recording,
  type Execution,
  type RecordingAction,
} from '@/lib/api';
import { useWebSocket } from '@/hooks/use-websocket';
import { RecordingJsonEditor } from '@/components/recording-json-editor';
import { NetworkTab } from '@/components/network-tab';

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
  const [useMock, setUseMock] = useState(false);
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
        setReplayStatus('running');
        break;
      }
      case 'replay:done': {
        const payload = msg.payload as { status: 'passed' | 'failed' };
        setReplayStatus(payload.status);
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
    await replayRecording(id!, { useMock });
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
        <Link to="/" className="text-sm text-zinc-400 hover:text-zinc-200">← 返回</Link>
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
            <button
              onClick={handleReplay}
              disabled={replayStatus === 'running'}
              className="rounded bg-green-900 px-4 py-2 text-sm hover:bg-green-800 disabled:opacity-50"
            >
              {replayStatus === 'running' ? '⏳ 回放中...' : replayStatus === 'passed' ? '✅ 通过' : replayStatus === 'failed' ? '❌ 失败' : '▶ 回放'}
            </button>
          </div>
        </div>
      </div>

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
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
