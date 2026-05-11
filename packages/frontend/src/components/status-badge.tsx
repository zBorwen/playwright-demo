import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

export type StatusType = 'passed' | 'failed' | 'running';

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
}

const STATUS_CONFIG: Record<StatusType, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  passed: { icon: CheckCircle, label: '通过' },
  failed: { icon: XCircle, label: '失败' },
  running: { icon: Loader2, label: '运行中' },
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const displayLabel = label ?? config.label;
  const Icon = config.icon;

  const iconClass = status === 'running'
    ? 'h-3.5 w-3.5 animate-spin'
    : 'h-3.5 w-3.5';

  const badgeClass =
    status === 'passed' ? 'badge-success' :
    status === 'failed' ? 'badge-error' :
    'badge-running';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}>
      <Icon className={iconClass} />
      {displayLabel}
    </span>
  );
}

export function StatusIcon({ status }: { status: StatusType }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  const iconClass =
    status === 'failed' ? 'text-red-400' :
    status === 'passed' ? 'text-green-400' :
    'text-blue-400 animate-spin';

  return <Icon className={`h-4 w-4 ${iconClass}`} />;
}
