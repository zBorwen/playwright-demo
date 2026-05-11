import { useState, useCallback, useEffect } from 'react';
import { Routes, Route, useParams } from 'react-router-dom';
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
      if (msg.type === 'batch-replay:result') {
        const p = msg.payload as { recordingId: string; status: 'passed' | 'failed' | 'running' | 'pending'; error?: string; executionId?: string; projectId?: string };
        if (p.status !== 'pending') {
          useRecordingReplayStore.getState().setRecordingStatus({
            recordingId: p.recordingId,
            status: p.status === 'running' ? 'running' : p.status,
            error: p.error,
            executionId: p.executionId,
            projectId: p.projectId,
          });
        }
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
        <h1 className="text-xl font-semibold">项目列表</h1>
        <button
          className="rounded bg-zinc-800 px-4 py-2 text-sm font-medium transition-colors hover:bg-zinc-700"
          onClick={() => setShowForm(true)}
        >
          + 新建项目
        </button>
      </div>
      <ProjectList reloadKey={reloadKey} />
      {showForm && <ProjectForm onSuccess={handleSuccess} onCancel={() => setShowForm(false)} />}
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
