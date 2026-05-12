import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { createRecording } from '@/lib/api';
import { SlideOver } from '@/components/slide-over';

interface NewRecordingSlideOverProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
}

export function NewRecordingSlideOver({ open, onClose, projectId }: NewRecordingSlideOverProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle('');
      setTargetUrl('');
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const recording = await createRecording({
        projectId,
        title: title.trim(),
        targetUrl: targetUrl.trim() || undefined,
      });
      onClose();
      navigate(`/recordings/${recording.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <SlideOver open={open} onClose={onClose} title="新建录制">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Title */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300" htmlFor="nr-title">
            标题 <span className="text-red-400">*</span>
          </label>
          <input
            id="nr-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="录制标题"
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            required
            autoFocus
          />
        </div>

        {/* Target URL */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300" htmlFor="nr-url">
            目标 URL
          </label>
          <input
            id="nr-url"
            type="url"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>

        {/* Error */}
        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            disabled={submitting}
          >
            取消
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-400 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={submitting || !title.trim()}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? '创建中...' : '创建并开始录制'}
          </button>
        </div>
      </form>
    </SlideOver>
  );
}
