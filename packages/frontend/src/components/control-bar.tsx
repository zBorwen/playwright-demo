import { Zap } from 'lucide-react';

interface ControlBarProps {
  mockEnabled: boolean;
  replaySpeed: 'fast' | 'normal' | 'slow';
  disabled: boolean;
  onMockChange: (checked: boolean) => void;
  onSpeedChange: (speed: 'fast' | 'normal' | 'slow') => void;
}

const SPEED_OPTIONS: { value: 'fast' | 'normal' | 'slow'; label: string }[] = [
  { value: 'fast', label: '快' },
  { value: 'normal', label: '标准' },
  { value: 'slow', label: '慢' },
];

export function ControlBar({ mockEnabled, replaySpeed, disabled, onMockChange, onSpeedChange }: ControlBarProps) {
  return (
    <div className="flex items-center gap-1.5">
      {/* Mock toggle pill */}
      <button
        onClick={() => !disabled && onMockChange(!mockEnabled)}
        disabled={disabled}
        className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
          mockEnabled
            ? 'bg-violet-600/20 text-violet-400 ring-1 ring-violet-600/30'
            : 'bg-zinc-800 text-zinc-500 ring-1 ring-zinc-700 hover:bg-zinc-750 hover:text-zinc-300'
        }`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        Mock
      </button>

      {/* Speed selector pills */}
      <div className="flex items-center rounded-full bg-zinc-800 ring-1 ring-zinc-700 p-0.5">
        {SPEED_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => !disabled && onSpeedChange(opt.value)}
            disabled={disabled}
            className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-all disabled:cursor-not-allowed ${
              opt.value === replaySpeed
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {opt.value === 'fast' && <Zap className="h-3 w-3" />}
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
