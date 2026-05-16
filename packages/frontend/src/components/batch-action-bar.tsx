import { Check, X } from 'lucide-react';
import type { BrowserType } from '@playwright-demo/shared';

interface BatchAction {
  label: string;
  loadingLabel: string;
  loading: boolean;
  disabled: boolean;
  variant: 'primary' | 'danger';
  onClick: () => void;
}

interface BatchActionBarProps {
  count: number;
  countLabel: string;
  actions: BatchAction[];
  onCancel: () => void;
  headless?: boolean;
  browserType?: BrowserType;
  onHeadlessChange?: (headless: boolean) => void;
  onBrowserTypeChange?: (type: BrowserType) => void;
}

const VARIANT_CLASSES: Record<string, string> = {
  primary: 'bg-violet-600 text-white shadow-sm shadow-violet-600/20 hover:bg-violet-500 hover:shadow-violet-500/30',
  danger: 'border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20',
};

export function BatchActionBar({ count, countLabel, actions, onCancel, headless = true, browserType = 'chromium', onHeadlessChange, onBrowserTypeChange }: BatchActionBarProps) {
  const visible = count > 0;

  return (
    <div
      className={`mb-4 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-2.5 transition-all duration-200 ease-out ${
        visible
          ? 'opacity-100 visible'
          : 'opacity-0 invisible h-0 py-0 border-0 overflow-hidden'
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-400">
          <Check className="h-3 w-3" />
          {count} {countLabel}
        </span>
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            disabled={action.loading || action.disabled}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
              VARIANT_CLASSES[action.variant]
            }`}
          >
            {action.loading ? action.loadingLabel : action.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        {onBrowserTypeChange && (
          <div className="flex items-center rounded-lg border border-zinc-700 bg-zinc-800 p-0.5">
            {(['chromium', 'firefox', 'webkit'] as BrowserType[]).map((type) => {
              const labels: Record<BrowserType, string> = { chromium: 'Cr', firefox: 'Fx', webkit: 'Wk' };
              return (
                <button
                  key={type}
                  onClick={() => onBrowserTypeChange(type)}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    browserType === type
                      ? 'bg-violet-600 text-white'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {labels[type]}
                </button>
              );
            })}
          </div>
        )}
        {onHeadlessChange && (
          <div className="flex items-center rounded-lg border border-zinc-700 bg-zinc-800 p-0.5">
            <button
              onClick={() => onHeadlessChange(false)}
              className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                !headless
                  ? 'bg-violet-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Headed
            </button>
            <button
              onClick={() => onHeadlessChange(true)}
              className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                headless
                  ? 'bg-violet-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Headless
            </button>
          </div>
        )}
      </div>
      <button
        onClick={onCancel}
        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
      >
        <X className="h-3.5 w-3.5" />
        取消
      </button>
    </div>
  );
}
