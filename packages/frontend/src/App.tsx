import { useState, useCallback, useEffect } from 'react';
import { Routes, Route, useParams } from 'react-router-dom';
import { FolderPlus } from 'lucide-react';
import { ProjectList } from '@/components/project-list';
import { ProjectForm } from '@/components/project-form';
import { ProjectDetail } from '@/components/project-detail';
import { RecordingsList } from '@/components/recordings-list';
import { RecordingDetail } from '@/components/recording-detail';
import { ExecutionDetail } from '@/components/execution-detail';
import { Dashboard } from '@/components/dashboard';
import { AppLayout } from '@/components/app-layout';
import { connect, subscribeToMessages } from '@/hooks/use-websocket';
import { useRecordingReplayStore } from '@/store/recording-replay-store';

function RecordingDetailWithKey() {
  const { id } = useParams<{ id: string }>();
  return <RecordingDetail key={id} />;
}

export function App() {
  useEffect(() => {
    connect();
    useRecordingReplayStore.getState().hydrate();

    const unsub = subscribeToMessages((msg) => {
      const store = useRecordingReplayStore.getState();
      if (msg.type === 'batch-replay:result') {
        const p = msg.payload as { recordingId: string; status: 'passed' | 'failed' | 'running' | 'pending'; error?: string; executionId?: string; projectId?: string };
        if (p.status !== 'pending') {
          store.setRecordingStatus({
            recordingId: p.recordingId,
            status: p.status === 'running' ? 'running' : p.status,
            error: p.error,
            executionId: p.executionId,
            projectId: p.projectId,
          });
        }
      } else if (msg.type === 'replay:step') {
        const p = msg.payload as { recordingId: string; executionId: string; index: number; status: 'completed' | 'failed'; error?: string };
        if (p.recordingId) store.handleReplayStep(p);
      } else if (msg.type === 'replay:done') {
        const p = msg.payload as { recordingId: string; executionId?: string; status: 'passed' | 'failed'; error?: string };
        if (p.recordingId) store.handleReplayDone(p);
      }
    });

    return () => unsub();
  }, []);

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/projects/:projectId/recordings" element={<RecordingsPage />} />
        <Route path="/recordings" element={<GlobalRecordingsPage />} />
        <Route path="/recordings/:id" element={<RecordingDetailWithKey />} />
        <Route path="/executions/:id" element={<ExecutionDetail />} />
      </Routes>
    </AppLayout>
  );
}

function ProjectsPage() {
  const [showForm, setShowForm] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const handleSuccess = useCallback(() => {
    setShowForm(false);
    setReloadKey((k) => k + 1);
  }, []);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">项目列表</h1>
          <p className="mt-1 text-sm text-zinc-500">管理你的项目和配置。</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-400"
        >
          <FolderPlus className="h-4 w-4" />
          新建项目
        </button>
      </div>
      <ProjectList reloadKey={reloadKey} />
      {showForm && <ProjectForm open={showForm} onSuccess={handleSuccess} onCancel={() => setShowForm(false)} />}
    </div>
  );
}

function RecordingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <div>
      <RecordingsList projectId={projectId} />
    </div>
  );
}

function GlobalRecordingsPage() {
  return <RecordingsList />;
}
