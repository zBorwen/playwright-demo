import { Zap, Monitor, Terminal } from 'lucide-react';
import type { BrowserType } from '@playwright-demo/shared';
import type { ComponentType, SVGProps } from 'react';

interface ControlBarProps {
  mockEnabled: boolean;
  replaySpeed: 'fast' | 'normal' | 'slow';
  disabled: boolean;
  headless: boolean;
  browserType: BrowserType;
  onMockChange: (checked: boolean) => void;
  onSpeedChange: (speed: 'fast' | 'normal' | 'slow') => void;
  onHeadlessChange: (headless: boolean) => void;
  onBrowserTypeChange: (type: BrowserType) => void;
}

const SPEED_OPTIONS: { value: 'fast' | 'normal' | 'slow'; label: string }[] = [
  { value: 'fast', label: '快' },
  { value: 'normal', label: '标准' },
  { value: 'slow', label: '慢' },
];

const BROWSER_OPTIONS: { value: BrowserType; label: string }[] = [
  { value: 'chromium', label: 'Cr' },
  { value: 'firefox', label: 'Fx' },
  { value: 'webkit', label: 'Wk' },
];

const HEADLESS_OPTIONS: { value: boolean; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { value: false, label: 'Headed', icon: Monitor },
  { value: true, label: 'Headless', icon: Terminal },
];

export function ControlBar({
  mockEnabled,
  replaySpeed,
  disabled,
  headless,
  browserType,
  onMockChange,
  onSpeedChange,
  onHeadlessChange,
  onBrowserTypeChange,
}: ControlBarProps) {
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

      {/* Browser type selector pills */}
      <div className="flex items-center rounded-full bg-zinc-800 ring-1 ring-zinc-700 p-0.5">
        {BROWSER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => !disabled && onBrowserTypeChange(opt.value)}
            disabled={disabled}
            className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-all disabled:cursor-not-allowed ${
              opt.value === browserType
                ? 'bg-violet-600 text-white shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Headless mode selector pills */}
      <div className="flex items-center rounded-full bg-zinc-800 ring-1 ring-zinc-700 p-0.5">
        {HEADLESS_OPTIONS.map(opt => {
          const Icon = opt.icon;
          return (
            <button
              key={String(opt.value)}
              onClick={() => !disabled && onHeadlessChange(opt.value)}
              disabled={disabled}
              className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-all disabled:cursor-not-allowed ${
                opt.value === headless
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon className="h-3 w-3" />
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
