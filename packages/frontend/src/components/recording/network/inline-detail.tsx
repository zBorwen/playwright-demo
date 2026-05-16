import type { NetworkEntry, MockRule } from '@playwright-demo/shared';
import { Pencil } from 'lucide-react';
import { highlightJSON } from '@/lib/syntax-highlight';
import { METHOD_COLORS, statusColor, formatSize, totalTiming } from './types';

export function InlineDetail({
  entry,
  mockRule,
  onToggleMock,
  onOpenMockEdit,
}: {
  entry: NetworkEntry;
  mockRule?: MockRule;
  onToggleMock: () => void;
  onOpenMockEdit: () => void;
}) {
  const isMocked = !!mockRule;

  return (
    <div className="bg-zinc-900/80 border-t border-zinc-800">
      <div className="p-6 space-y-5">
        {/* ── Section 1: Request Info ── */}
        <div>
          <span className="mb-3 block text-xs font-medium text-zinc-400">请求信息</span>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-5">
            <div className="grid grid-cols-3 gap-x-6 gap-y-4">
              <InfoRow label="Method" value={entry.method} color={METHOD_COLORS[entry.method] ?? 'text-zinc-200'} />
              <InfoRow label="Status" value={`${entry.status} ${entry.statusText}`} color={statusColor(entry.status)} />
              <InfoRow label="MIME" value={entry.mimeType} />
              <InfoRow label="Size" value={formatSize(entry.contentSize)} />
              <InfoRow label="Wait" value={`${entry.timing.wait}ms`} />
              <InfoRow label="Total" value={totalTiming(entry.timing)} />
            </div>
          </div>
        </div>

        {/* ── Section 2: Mock ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-zinc-400">Mock</span>
            <div className="flex items-center gap-2">
              <button
                onClick={onToggleMock}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  isMocked
                    ? 'bg-violet-600/20 text-violet-400 ring-1 ring-violet-600/30'
                    : 'bg-zinc-800 text-zinc-500 ring-1 ring-zinc-700 hover:bg-zinc-750 hover:text-zinc-300'
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {isMocked ? '已启用' : '未启用'}
              </button>
              {isMocked && (
                <button
                  onClick={onOpenMockEdit}
                  className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                >
                  <Pencil className="h-3 w-3" />
                  编辑 Mock
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Section 3: Raw Response ── */}
        {entry.responseBody && (
          <div>
            <span className="mb-3 block text-xs font-medium text-zinc-400">原始响应</span>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 overflow-hidden">
              <details className="group">
                <summary className="cursor-pointer px-4 py-3 text-xs text-zinc-500 transition-colors hover:text-zinc-300">
                  点击展开查看
                </summary>
                <pre
                  className="border-t border-zinc-800 max-h-[32rem] overflow-auto p-4 text-sm font-mono text-zinc-400 whitespace-pre-wrap break-all"
                  dangerouslySetInnerHTML={{ __html: highlightJSON(entry.responseBody ?? '') }}
                />
              </details>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className={`font-mono text-sm ${color ?? 'text-zinc-200'}`}>{value}</span>
    </div>
  );
}
