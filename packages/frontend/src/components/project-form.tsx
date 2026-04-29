import { useState, type FormEvent } from 'react';
import { createProject } from '@/lib/api';

interface ProjectFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function ProjectForm({ onSuccess, onCancel }: ProjectFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setErr(null);
    try {
      await createProject({ name: name.trim(), description: description.trim() || undefined });
      onSuccess();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-6">
        <h2 className="mb-4 text-lg font-semibold">新建项目</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="project-name" className="mb-1 block text-sm text-zinc-400">
              名称 <span className="text-red-400">*</span>
            </label>
            <input
              id="project-name"
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="项目名称"
              autoFocus
              required
            />
          </div>
          <div>
            <label htmlFor="project-desc" className="mb-1 block text-sm text-zinc-400">
              描述
            </label>
            <textarea
              id="project-desc"
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="可选"
              rows={3}
            />
          </div>
          {err && <p className="text-sm text-red-400">{err}</p>}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="rounded px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200"
              onClick={onCancel}
              disabled={submitting}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="rounded bg-zinc-200 px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50 hover:bg-white"
            >
              {submitting ? '创建中...' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
