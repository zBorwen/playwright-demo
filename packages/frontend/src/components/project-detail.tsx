import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchProjects, type Project } from '@/lib/api';
import { RecordingsList } from '@/components/recordings-list';

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchProjects()
      .then((projects) => {
        const found = projects.find((p) => p.id === id);
        if (found) {
          setProject(found);
        } else {
          setError('项目不存在');
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <p className="text-zinc-500">加载中...</p>;
  if (error || !project) return <p className="text-zinc-500">项目不存在</p>;

  return (
    <div>
      <div className="mb-6">
        <Link to="/projects" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← 返回项目列表
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{project.name}</h1>
        {project.description && (
          <p className="mt-1 text-zinc-400">{project.description}</p>
        )}
      </div>
      <RecordingsList projectId={id} />
    </div>
  );
}
