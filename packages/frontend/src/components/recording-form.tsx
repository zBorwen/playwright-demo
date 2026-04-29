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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
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

        <div className="mb-4">
          <label className="mb-1 block text-sm text-zinc-400" htmlFor="recording-title">
            标题 <span className="text-red-400">*</span>
          </label>
          <input
            id="recording-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="录制标题"
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
            required
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm text-zinc-400" htmlFor="recording-url">
            目标 URL
          </label>
          <input
            id="recording-url"
            type="url"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
          />
        </div>

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-4 py-2 text-sm hover:bg-zinc-800"
            disabled={submitting}
          >
            取消
          </button>
          <button
            type="submit"
            className="rounded bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700 disabled:opacity-50"
            disabled={submitting || !title.trim()}
          >
            {submitting ? '创建中...' : '创建'}
          </button>
        </div>
      </form>
    </div>
  );
}
