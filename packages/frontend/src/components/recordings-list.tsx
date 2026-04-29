import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchRecordings, type Recording } from '@/lib/api';
import { RecordingForm } from '@/components/recording-form';

interface RecordingsListProps {
  projectId?: string;
  reloadKey?: number;
}

export function RecordingsList({ projectId, reloadKey = 0 }: RecordingsListProps) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const fetch = () => {
    setLoading(true);
    fetchRecordings(projectId)
      .then((data) => {
        setRecordings(data);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
        setRecordings([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch();
  }, [projectId, reloadKey]);

  const handleSuccess = () => {
    setShowForm(false);
    fetch();
  };

  if (loading) return <p className="text-zinc-500">加载中...</p>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">录制列表</h2>
        <button
          className="rounded bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700"
          onClick={() => setShowForm(true)}
        >
          + 新建录制
        </button>
      </div>

      {error && <p className="mb-4 text-red-400">{error}</p>}

      {recordings.length === 0 ? (
        <p className="text-zinc-500">暂无录制</p>
      ) : (
        <div className="space-y-2">
          {recordings.map((r) => (
            <Link
              key={r.id}
              to={`/recordings/${r.id}`}
              className="block rounded-lg border border-zinc-800 bg-zinc-900 p-4 transition hover:border-zinc-600"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{r.title}</h3>
                  {r.targetUrl && (
                    <p className="mt-1 text-sm text-zinc-400">{r.targetUrl}</p>
                  )}
                </div>
                <span className="text-xs text-zinc-500">
                  {new Date(r.createdAt).toLocaleDateString()}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showForm && projectId && (
        <RecordingForm
          projectId={projectId}
          onSuccess={handleSuccess}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
