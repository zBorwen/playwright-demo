import { useState, useCallback, useEffect } from 'react';
import { Routes, Route, Link, useParams } from 'react-router-dom';
import { ProjectList } from '@/components/project-list';
import { ProjectForm } from '@/components/project-form';
import { ProjectDetail } from '@/components/project-detail';
import { RecordingsList } from '@/components/recordings-list';
import { RecordingDetail } from '@/components/recording-detail';
import { ExecutionDetail } from '@/components/execution-detail';
import { connect, subscribeToMessages } from '@/hooks/use-websocket';
import { useBatchReplayStore } from '@/store/batch-replay-store';

export function App() {
  // Ensure single WS connection, hydrate batch state, register global batch-replay listener
  useEffect(() => {
    connect();
    useBatchReplayStore.getState().hydrate();

    const unsub = subscribeToMessages((msg) => {
      if (msg.type === 'batch-replay:result') {
        const p = msg.payload as { recordingId: string; status: 'passed' | 'failed' | 'running' | 'pending'; error?: string; executionId?: string };
        const store = useBatchReplayStore.getState();
        // Update ALL running batches that contain this recording
        for (const batchId of Object.keys(store.batches)) {
          const batch = store.batches[batchId];
          if (!batch.isRunning) continue;
          if (batch.items.some(i => i.recordingId === p.recordingId)) {
            store.updateItem(batchId, p.recordingId, {
              status: p.status,
              error: p.error,
              executionId: p.executionId,
            });
          }
        }
      }
    });

    return () => unsub();
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <nav className="flex items-center gap-6">
          <Link to="/" className="text-lg font-semibold">
            Playwright 平台
          </Link>
          <Link to="/projects" className="text-sm text-zinc-400 hover:text-zinc-200">
            项目
          </Link>
        </nav>
      </header>
      <main className="p-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/projects/:projectId/recordings" element={<RecordingsPage />} />
          <Route path="/recordings/:id" element={<RecordingDetail />} />
          <Route path="/executions/:id" element={<ExecutionDetail />} />
        </Routes>
      </main>
    </div>
  );
}

function Home() {
  return (
    <div>
      <h1 className="text-2xl font-bold">欢迎</h1>
      <p className="mt-2 text-zinc-400">选择一个项目开始录制或回放。</p>
    </div>
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
        <h1 className="text-2xl font-bold">项目列表</h1>
        <button
          className="rounded bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700"
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
      <div className="mb-6">
        <Link to={`/projects/${projectId}`} className="text-sm text-zinc-400 hover:text-zinc-200">
          ← 返回项目
        </Link>
        <h1 className="mt-2 text-2xl font-bold">录制列表</h1>
      </div>
      <RecordingsList projectId={projectId} />
    </div>
  );
}
