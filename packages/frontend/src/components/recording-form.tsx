import { useState, useEffect } from 'react';
import { createRecording } from '@/lib/api';

interface RecordingFormProps {
  projectId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function RecordingForm({ projectId, onSuccess, onCancel }: RecordingFormProps) {
  const [title, setTitle] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onCancel();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onCancel, submitting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      await createRecording({
        projectId,
        title: title.trim(),
        targetUrl: targetUrl.trim() || undefined,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => !submitting && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-label="新建录制"
    >
      <form
        className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-6"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 className="mb-4 text-lg font-semibold">新建录制</h2>

        <div className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300" htmlFor="recording-title">
              标题 <span className="text-red-400">*</span>
            </label>
            <input
              id="recording-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="录制标题"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              required
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300" htmlFor="recording-url">
              目标 URL
            </label>
            <input
              id="recording-url"
              type="url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              disabled={submitting}
            >
              取消
            </button>
            <button
              type="submit"
              className="rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-400 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={submitting || !title.trim()}
            >
              {submitting ? '创建中...' : '创建'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
