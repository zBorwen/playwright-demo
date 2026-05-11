import { CheckCircle, XCircle, Loader2, Clock, AlertTriangle, Circle } from 'lucide-react';

export type StatusType = 'passed' | 'failed' | 'running' | 'pending' | 'warning' | 'recording';

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  className?: string;
}

const STATUS_CONFIG: Record<StatusType, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  passed: { icon: CheckCircle, label: '通过' },
  failed: { icon: XCircle, label: '失败' },
  running: { icon: Loader2, label: '运行中' },
  pending: { icon: Clock, label: '排队中' },
  warning: { icon: AlertTriangle, label: '警告' },
  recording: { icon: Circle, label: '录制中' },
};

export function StatusBadge({ status, label, className = '' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const displayLabel = label ?? config.label;
  const Icon = config.icon;

  const iconClass = status === 'running'
    ? 'h-3.5 w-3.5 animate-spin'
    : status === 'recording'
    ? 'h-3.5 w-3.5 animate-pulse text-red-500'
    : 'h-3.5 w-3.5';

  const badgeClass =
    status === 'passed' ? 'badge-success' :
    status === 'failed' ? 'badge-error' :
    status === 'running' ? 'badge-running' :
    status === 'warning' ? 'badge-warning' :
    status === 'recording' ? 'badge-error' :
    'badge-muted';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass} ${className}`}>
      <Icon className={iconClass} />
      {displayLabel}
    </span>
  );
}

export function StatusIcon({ status, className = '' }: { status: StatusType; className?: string }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  const iconClass =
    status === 'failed' ? 'text-red-400' :
    status === 'passed' ? 'text-green-400' :
    status === 'running' ? 'text-blue-400 animate-spin' :
    status === 'recording' ? 'text-red-500 animate-pulse' :
    status === 'warning' ? 'text-yellow-400' :
    'text-zinc-500';

  return <Icon className={`h-4 w-4 ${iconClass} ${className}`} />;
}
