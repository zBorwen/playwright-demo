import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchProjects, deleteProject } from '@/lib/api';
import { useAppStore } from '@/store/app-store';

export function ProjectList({ reloadKey = 0 }: { reloadKey?: number }) {
  const { projects, loadingProjects, projectError, setProjects, setLoadingProjects, setProjectError } =
    useAppStore();
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    setLoadingProjects(true);
    fetchProjects()
      .then((data) => {
        setProjects(data);
        setProjectError(null);
      })
      .catch((error: Error) => {
        setProjectError(error.message);
      })
      .finally(() => setLoadingProjects(false));
  }, [reloadKey]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除项目「${name}」吗？该项目下的所有录制也将被删除。`)) return;
    setDeleting(id);
    await deleteProject(id);
    setDeleting(null);
    // Refresh the list
    const data = await fetchProjects();
    setProjects(data);
  };

  if (loadingProjects) return <p className="text-zinc-500">加载中...</p>;
  if (projectError) return <p className="text-red-400">{projectError}</p>;
  if (!projects.length) return <p className="text-zinc-500">暂无项目</p>;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => (
        <div
          key={p.id}
          className="group relative rounded-lg border border-zinc-800 bg-zinc-900 p-5 transition hover:border-zinc-600"
        >
          <Link to={`/projects/${p.id}`} className="block">
            <h3 className="font-semibold">{p.name}</h3>
            {p.description && (
              <p className="mt-1 text-sm text-zinc-400">{p.description}</p>
            )}
          </Link>
          <button
            onClick={() => handleDelete(p.id, p.name)}
            disabled={deleting === p.id}
            className="absolute top-3 right-3 rounded p-1 text-zinc-600 transition hover:text-red-400 hover:bg-red-950 opacity-0 group-hover:opacity-100 disabled:opacity-50"
            title="删除项目"
          >
            {deleting === p.id ? '…' : '🗑'}
          </button>
        </div>
      ))}
    </div>
  );
}
