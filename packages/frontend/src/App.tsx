import { Routes, Route, Link } from 'react-router-dom';

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
  return (
    <div>
      <h1 className="text-2xl font-bold">项目列表</h1>
      <p className="mt-2 text-zinc-400">加载中...</p>
    </div>
  );
}
