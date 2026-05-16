import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
}

export function EmptyState({ icon: Icon, title, subtitle }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
      <Icon className="mb-4 h-12 w-12 text-zinc-700" />
      <p className="text-sm">{title}</p>
      {subtitle && <p className="mt-1 text-xs text-zinc-600">{subtitle}</p>}
    </div>
  );
}
