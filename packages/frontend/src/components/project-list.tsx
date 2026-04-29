import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchProjects } from '@/lib/api';
import { useAppStore } from '@/store/app-store';

export function ProjectList({ reloadKey = 0 }: { reloadKey?: number }) {
  const { projects, loadingProjects, projectError, setProjects, setLoadingProjects, setProjectError } =
    useAppStore();

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

  if (loadingProjects) return <p className="text-zinc-500">加载中...</p>;
  if (projectError) return <p className="text-red-400">{projectError}</p>;
  if (!projects.length) return <p className="text-zinc-500">暂无项目</p>;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => (
        <Link
          key={p.id}
          to={`/projects/${p.id}`}
          className="block rounded-lg border border-zinc-800 bg-zinc-900 p-5 transition hover:border-zinc-600"
        >
          <h3 className="font-semibold">{p.name}</h3>
          {p.description && (
            <p className="mt-1 text-sm text-zinc-400">{p.description}</p>
          )}
        </Link>
      ))}
    </div>
  );
}
