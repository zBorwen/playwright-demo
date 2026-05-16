import { useState, type FormEvent } from 'react';
import { createProject } from '@/lib/api';
import { useAppStore } from '@/store/app-store';
import { SlideOver } from '@/components/ui/slide-over';

interface ProjectFormProps {
  open: boolean;
  onSuccess: () => void;
  onCancel: () => void;
}

export function ProjectForm({ open, onSuccess, onCancel }: ProjectFormProps) {
  const { addProject } = useAppStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const project = await createProject({ name: name.trim(), description: description.trim() || undefined });
      addProject(project);
      setName('');
      setDescription('');
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SlideOver open={open} onClose={onCancel} title="新建项目">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name */}
        <div>
          <label htmlFor="project-name" className="mb-1.5 block text-sm font-medium text-zinc-300">
            名称 <span className="text-red-400">*</span>
          </label>
          <input
            id="project-name"
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="项目名称"
            autoFocus
            required
          />
        </div>
        {/* Description */}
        <div>
          <label htmlFor="project-desc" className="mb-1.5 block text-sm font-medium text-zinc-300">
            描述
          </label>
          <textarea
            id="project-desc"
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="可选"
            rows={3}
          />
        </div>
        {/* Error */}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {/* Actions */}
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
            disabled={submitting || !name.trim()}
            className="rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? '创建中...' : '创建'}
          </button>
        </div>
      </form>
    </SlideOver>
  );
}
