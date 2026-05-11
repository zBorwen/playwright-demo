import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  fetchRecording,
  fetchRecordingActions,
  fetchRecordingCodegen,
  fetchExecutions,
  fetchExecution,
  fetchProject,
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
import { ExecutionList } from '@/components/execution-list';
import { TraceViewerModal } from '@/components/trace-viewer-modal';
import { detectRunningExecution } from '@/lib/replay-state';
import { formatActionDetail } from '@/lib/action-formatter';
import { useRecordingReplayStore } from '@/store/recording-replay-store';
import { RecordingHeader } from '@/components/recording-header';
import { CodegenTab } from '@/components/codegen-tab';
import { TabBar } from '@/components/tab-bar';
import { StepListPanel } from '@/components/step-list-panel';
import { Code } from 'lucide-react';

type Tab = 'timeline' | 'codegen' | 'network' | 'json' | 'executions';

export function RecordingDetail() {
  const { id } = useParams<{ id: string }>();
  const setReplayStoreStatus = useRecordingReplayStore(s => s.setRecordingStatus);
  const storeStatus = useRecordingReplayStore(s => id ? s.recordingReplays[id]?.status : undefined);
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
  const [replaySteps, setReplaySteps] = useState<ReplayStep[]>([]);
  const [replayExecutionId, setReplayExecutionId] = useState<string | null>(null);
  const replayExecutionIdRef = useRef<string | null>(null);

  useEffect(() => {
    replayExecutionIdRef.current = replayExecutionId;
  }, [replayExecutionId]);

  const replayStatus = storeStatus ?? 'idle';

  const [showTrace, setShowTrace] = useState(false);
  const [useMock, setUseMock] = useState(() => {
    try {
      return localStorage.getItem(`replay-use-mock:${id}`) === 'true';
    } catch {
      return false;
    }
  });

  const handleUseMockChange = (checked: boolean) => {
    setUseMock(checked);
    try {
      if (id) localStorage.setItem(`replay-use-mock:${id}`, String(checked));
    } catch {
      // localStorage may be blocked; non-critical
    }
  };
  const [projectReplaySpeed, setProjectReplaySpeed] = useState<'fast' | 'normal' | 'slow'>('normal');
  const [project, setProject] = useState<{ id: string; name: string; replaySpeed: 'fast' | 'normal' | 'slow' } | null>(null);
  const [codegen, setCodegen] = useState<string>('');

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
        if (stepPayload.recordingId && id && stepPayload.recordingId !== id) return;
        if (stepPayload.executionId && replayExecutionIdRef.current && stepPayload.executionId !== replayExecutionIdRef.current) return;
        if (stepPayload.executionId) setReplayExecutionId(stepPayload.executionId);
        setReplayStoreStatus({
          recordingId: id!,
          status: stepPayload.status === 'failed' ? 'failed' : 'running',
          executionId: stepPayload.executionId,
          error: stepPayload.error,
        });
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
        if (payload.recordingId && id && payload.recordingId !== id) return;
        if (payload.executionId && replayExecutionIdRef.current && payload.executionId !== replayExecutionIdRef.current) return;
        setReplayStoreStatus({
          recordingId: id!,
          status: payload.status,
          executionId: payload.executionId,
          error: payload.error,
        });
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
        }).catch((e) => console.warn('Failed to fetch project settings:', e.message));
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
        setReplaySteps(steps);
      }
    }).catch((e) => {
      setLoadError(e.message);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (!replayExecutionId || replayStatus !== 'running') return;
    const timer = setTimeout(() => {
      fetchExecution(replayExecutionId).then((ex) => {
        if (ex.status !== 'running') {
          setReplayStoreStatus({
            recordingId: id!,
            status: ex.status as 'passed' | 'failed',
            executionId: replayExecutionId,
          });
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
    setReplayStoreStatus({ recordingId: id!, status: 'running' });
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


  const handleSpeedChange = (newSpeed: 'fast' | 'normal' | 'slow') => {
    setProjectReplaySpeed(newSpeed);
    if (project) {
      // updateProjectSettings(project.id, { replaySpeed: newSpeed }).catch((e) => console.warn('Failed to save replay speed:', e.message));
    }
  };

  // Derive last execution info for header
  const lastExecution = executions.length > 0 ? executions[0] : null;
  const lastExecutedAt = lastExecution?.finishedAt
    ? (() => {
        const diff = Date.now() - new Date(lastExecution.finishedAt!).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return '刚刚';
        if (mins < 60) return `${mins} 分钟前`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} 小时前`;
        return `${Math.floor(hours / 24)} 天前`;
      })()
    : undefined;

  const [selectedStep, setSelectedStep] = useState<number | null>(null);

  if (loading) return <div className="text-zinc-500">加载中...</div>;
  if (loadError) return <div className="text-red-400">加载失败: {loadError}</div>;
  if (!recording) return <div className="text-zinc-500">录制不存在</div>;

  const isTimeline = activeTab === 'timeline';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <RecordingHeader
        recording={recording}
        recordingStatus={recordingStatus}
        replayStatus={replayStatus}
        storeStatus={storeStatus}
        useMock={useMock}
        projectReplaySpeed={projectReplaySpeed}
        actionsCount={actions.length}
        lastExecutionStatus={lastExecution?.status}
        lastExecutedAt={lastExecutedAt}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onReplay={handleReplay}
        onUseMockChange={handleUseMockChange}
        onSpeedChange={handleSpeedChange}
      />

      {/* Replay Panel (during replay) */}
      {replaySteps.length > 0 && replayStatus === 'running' && (
        <div className="mb-4">
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
        </div>
      )}

      {/* Tab bar */}
      <TabBar
        activeTab={activeTab}
        onChange={setActiveTab}
        counts={{ timeline: actions.length, executions: executions.length }}
      />

      {/* Content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Step list panel (only in timeline tab) */}
        {isTimeline && (
          <StepListPanel
            actions={actions}
            steps={replaySteps}
            isRunning={replayStatus === 'running'}
            selectedStep={selectedStep}
            onSelectStep={(i) => setSelectedStep(selectedStep === i ? null : i)}
          />
        )}

        {/* Main content */}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {activeTab === 'timeline' && (
            selectedStep !== null ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-200">
                    步骤 {selectedStep + 1}: {actions[selectedStep]?.name}
                  </h3>
                  <button
                    onClick={() => setSelectedStep(null)}
                    className="text-xs text-zinc-500 hover:text-zinc-300"
                  >
                    返回列表
                  </button>
                </div>
                {(() => {
                  const action = actions[selectedStep];
                  if (!action) return null;
                  const step = replaySteps.find(s => s.index === selectedStep);
                  const maskedAction = action.name === 'fill' && ('selector' in action)
                    ? { ...action, value: /password|passwd|pwd|密码|口令/i.test(action.selector) ? '***' : action.value }
                    : action;
                  return (
                    <div className="space-y-3">
                      {/* Error message for failed steps */}
                      {step?.status === 'failed' && step?.error && (
                        <div className="rounded-lg border border-red-800 bg-red-950/50 p-4">
                          <h4 className="mb-2 text-xs font-medium text-red-400">错误信息</h4>
                          <pre className="overflow-auto text-xs font-mono text-red-300 whitespace-pre-wrap">
                            {step.error}
                          </pre>
                        </div>
                      )}
                      {/* Action parameters */}
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                        <h4 className="mb-2 text-xs font-medium text-zinc-400">操作参数</h4>
                        <pre className="overflow-auto text-xs font-mono text-zinc-300">
                          {JSON.stringify(maskedAction, null, 2)}
                        </pre>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <CodegenTab codegen={codegen} />
            )
          )}

          {activeTab === 'codegen' && (
            <CodegenTab codegen={codegen} />
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
            executions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
                <Code className="mb-3 h-10 w-10 text-zinc-700" />
                <p className="text-sm">暂无执行记录</p>
                <p className="mt-1 text-xs text-zinc-600">回放后将生成执行记录</p>
              </div>
            ) : (
              <ExecutionList executions={executions} />
            )
          )}
        </div>
      </div>

      {/* Trace Viewer Modal */}
      {showTrace && replayExecutionId && (
        <TraceViewerModal
          traceUrl={executionTraceUrl(replayExecutionId)}
          title={`执行 ${replayExecutionId}`}
          onClose={() => setShowTrace(false)}
        />
      )}
    </div>
  );
}
