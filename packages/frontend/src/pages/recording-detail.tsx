import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  fetchRecording,
  fetchRecordingActions,
  fetchRecordingCodegen,
  fetchExecutions,
  fetchProject,
  startRecording,
  stopRecording,
  replayRecording,
  executionTraceUrl,
  type Recording,
  type Execution,
  type BrowserType,
} from '@/lib/api';
import { useRecordingWebSocket } from '@/hooks/use-recording-websocket';
import { useRecordingReplayStore } from '@/store/recording-replay-store';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { RecordingJsonEditor } from '@/components/recording/recording-json-editor';
import { NetworkTab } from '@/components/recording/network-tab';
import { ExecutionList } from '@/components/execution/execution-list';
import { TraceViewerModal } from '@/components/ui/trace-viewer-modal';
import { isPasswordField } from '@/lib/action-formatter';
import { formatRelativeTime } from '@/lib/time-ago';
import { RecordingHeader } from '@/components/recording/recording-header';
import { CodegenTab } from '@/components/recording/codegen-tab';
import { TabBar, type TabKey } from '@/components/ui/tab-bar';
import { StepListPanel } from '@/components/recording/step-list-panel';
import { Eye, AlertCircle, X } from 'lucide-react';
import { highlightJSON } from '@/lib/syntax-highlight';

export function RecordingDetail() {
  const { id } = useParams<{ id: string }>();
  const replayStatus = useRecordingReplayStore(s => id ? s.recordingReplays[id]?.status : undefined);
  const replayExecutionId = useRecordingReplayStore(s => id ? s.recordingReplays[id]?.executionId : undefined);
  const startReplay = useRecordingReplayStore(s => s.startReplay);
  const initSteps = useRecordingReplayStore(s => s.initSteps);
  const actionsCount = useRecordingReplayStore(s => id ? (s.activeRecordingActions[id]?.length || 0) : 0);
  
  // Also we need `activeRecordingActions` just for the single selected step details
  const activeActions = useRecordingReplayStore(s => id ? s.activeRecordingActions[id] : undefined);
  const replaySteps = useRecordingReplayStore(s => id ? s.recordingReplays[id]?.replaySteps : undefined);

  const [recording, setRecording] = useState<Recording | null>(null);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('timeline');
  const [recordingStatus, setRecordingStatusLocal] = useState<'idle' | 'recording'>('idle');

  const [showTrace, setShowTrace] = useState(false);
  const [useMock, setUseMock] = useLocalStorage(`replay-use-mock:${id}`, false);
  const [headless, setHeadless] = useLocalStorage(`replay-headless:${id}`, true);
  const [browserType, setBrowserType] = useLocalStorage<BrowserType>(`replay-browser-type:${id}`, 'chromium');
  const [projectReplaySpeed, setProjectReplaySpeed] = useState<'fast' | 'normal' | 'slow'>('normal');

  const onRecordingComplete = useCallback(() => {
    setRecordingStatusLocal('idle');
  }, []);

  useRecordingWebSocket(id, browserType, onRecordingComplete);

  useEffect(() => {
    if (!id) return;
    const store = useRecordingReplayStore.getState();
    Promise.all([
      fetchRecording(id),
      fetchRecordingActions(id).catch(() => ({ actions: [] })),
      fetchExecutions(id),
      fetchRecordingCodegen(id).catch(() => ({ codegen: '' })),
    ]).then(([rec, acts, execs, codegenResp]) => {
      setRecording(rec);
      setExecutions(execs);
      
      store.setActions(id, acts.actions || []);
      store.setCodegen(id, codegenResp.codegen || '');
      
      setLoading(false);
      if (rec.projectId) {
        fetchProject(rec.projectId).then((p) => {
          setProjectReplaySpeed(p.replaySpeed || 'normal');
        }).catch((e) => console.warn('Failed to fetch project settings:', e.message));
      }
      initSteps(id, acts.actions || []);
    }).catch((e) => {
      setLoadError(e.message);
      setLoading(false);
    });
  }, [id, initSteps]);

  const handleStartRecording = async () => {
    const store = useRecordingReplayStore.getState();
    store.setActions(id!, []);
    store.setCodegen(id!, '');
    await startRecording(id!, { browserType });
    setRecordingStatusLocal('recording');
  };

  const handleStopRecording = async () => {
    await stopRecording(id!);
    setRecordingStatusLocal('idle');
    setTimeout(async () => {
      const store = useRecordingReplayStore.getState();
      const currentActions = store.activeRecordingActions[id!] || [];
      if (currentActions.length === 0 && id) {
        const acts = await fetchRecordingActions(id).catch(() => ({ actions: [] }));
        store.setActions(id, acts.actions || []);
      }
    }, 1000);
  };

  const handleReplay = async () => {
    setReplayError(null);
    if (actionsCount === 0) {
      setReplayError('没有可回放的操作步骤，请先进行录制。');
      return;
    }
    try {
      const { executionId } = await replayRecording(id!, { useMock, replaySpeed: projectReplaySpeed, headless, browserType });
      const store = useRecordingReplayStore.getState();
      const currentActions = store.activeRecordingActions[id!] || [];
      startReplay(id!, executionId, currentActions, recording?.projectId);

      const execs = await fetchExecutions(id!);
      setExecutions(execs);
    } catch (e) {
      setReplayError(e instanceof Error ? e.message : '回放启动失败');
    }
  };

  const handleJsonSave = async () => {
    if (id) {
      const acts = await fetchRecordingActions(id);
      useRecordingReplayStore.getState().setActions(id, acts.actions || []);
    }
  };

  const handleSpeedChange = (newSpeed: 'fast' | 'normal' | 'slow') => {
    setProjectReplaySpeed(newSpeed);
  };

  const lastExecution = executions.length > 0 ? executions[0] : null;
  const lastExecutedAt = lastExecution?.finishedAt
    ? formatRelativeTime(lastExecution.finishedAt)
    : undefined;

  const [selectedStep, setSelectedStep] = useState<number | null>(null);

  if (loading) return <div className="text-zinc-500">加载中...</div>;
  if (loadError) return <div className="text-red-400">加载失败: {loadError}</div>;
  if (!recording) return <div className="text-zinc-500">录制不存在</div>;

  const isTimeline = activeTab === 'timeline';

  return (
    <div className="flex flex-col h-full">
      {replayError && (
        <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2 text-red-400 text-sm font-medium">
            <AlertCircle className="h-4 w-4" />
            <span>{replayError}</span>
          </div>
          <button 
            onClick={() => setReplayError(null)}
            className="text-red-400/50 hover:text-red-400 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <RecordingHeader
        recording={recording}
        recordingStatus={recordingStatus}
        replayStatus={replayStatus ?? 'idle'}
        useMock={useMock}
        projectReplaySpeed={projectReplaySpeed}
        actionsCount={actionsCount}
        lastExecutionStatus={lastExecution?.status}
        lastExecutedAt={lastExecutedAt}
        headless={recordingStatus === 'recording' ? false : headless}
        browserType={browserType}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onReplay={handleReplay}
        onUseMockChange={setUseMock}
        onSpeedChange={handleSpeedChange}
        onHeadlessChange={setHeadless}
        onBrowserTypeChange={setBrowserType}
      />

      <TabBar
        activeTab={activeTab}
        onChange={setActiveTab}
        counts={{ timeline: actionsCount, executions: executions.length }}
      />

      <div className="flex flex-1 overflow-hidden">
        {isTimeline && (
          <StepListPanel
            recordingId={id!}
            isRunning={replayStatus === 'running'}
            selectedStep={selectedStep}
            onSelectStep={(i) => setSelectedStep(selectedStep === i ? null : i)}
          />
        )}

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {activeTab === 'timeline' && (
            selectedStep !== null ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-zinc-200">
                    步骤 {selectedStep + 1}: {activeActions?.[selectedStep]?.name}
                  </h3>
                  <button
                    onClick={() => setSelectedStep(null)}
                    className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300"
                  >
                    返回列表
                  </button>
                </div>
                {(() => {
                  const action = activeActions?.[selectedStep];
                  if (!action) return null;
                  const step = replaySteps?.find(s => s.index === selectedStep);
                  const maskedAction = action.name === 'fill' && isPasswordField(action)
                    ? { ...action, value: '***' }
                    : action;
                  return (
                    <div className="space-y-3">
                      {step?.status === 'failed' && step?.error && (
                        <div className="rounded-lg border border-red-800 bg-red-950/50 p-4 space-y-3">
                          <div>
                            <h4 className="mb-2 text-xs font-medium text-red-400">错误信息</h4>
                            <pre className="overflow-auto text-xs font-mono text-red-300 whitespace-pre-wrap">
                              {step.error}
                            </pre>
                          </div>
                          {replayExecutionId && (
                            <button
                              onClick={() => setShowTrace(true)}
                              className="inline-flex cursor-pointer items-center gap-1.5 rounded bg-red-900 px-3 py-1.5 text-sm text-red-200 hover:bg-red-800 transition"
                            >
                              <Eye className="h-4 w-4" /> 查看 Trace
                            </button>
                          )}
                        </div>
                      )}
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50">
                        <div className="flex items-center gap-1.5 border-b border-zinc-800 px-4 py-2.5">
                          <span className="text-xs font-medium text-zinc-400">操作参数</span>
                        </div>
                        <pre
                          className="overflow-auto p-4 text-xs font-mono text-zinc-300"
                          dangerouslySetInnerHTML={{
                            __html: highlightJSON(JSON.stringify(maskedAction, null, 2)),
                          }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <CodegenTab recordingId={id} />
            )
          )}

          {activeTab === 'codegen' && (
            <CodegenTab recordingId={id} />
          )}

          {activeTab === 'network' && id && <NetworkTab recordingId={id} />}

          {activeTab === 'json' && (
            <RecordingJsonEditor
              recordingId={id!}
              actions={activeActions || []}
              onSave={handleJsonSave}
            />
          )}

          {activeTab === 'executions' && <ExecutionList executions={executions} />}
        </div>
      </div>

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
