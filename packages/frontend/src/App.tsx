import { useState, useCallback } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { ProjectList } from '@/components/project-list';
import { ProjectForm } from '@/components/project-form';

export function App() {
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

  const handleSuccess = useCallback(() => {
    setShowForm(false);
    window.location.reload();
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
      <ProjectList />
      {showForm && <ProjectForm onSuccess={handleSuccess} onCancel={() => setShowForm(false)} />}
    </div>
  );
}
