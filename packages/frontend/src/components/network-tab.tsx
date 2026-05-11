import { useState, useEffect, useCallback, useRef } from 'react';
import type { NetworkEntry, MockRule } from '@playwright-demo/shared';
import {
  fetchRecordingNetwork,
  fetchRecordingMockRules,
  saveRecordingMockRules,
} from '@/lib/api';
import { ChevronDown, ChevronRight, Wand2, Pencil, X } from 'lucide-react';
import { highlightJSON } from '@/lib/syntax-highlight';

const METHOD_COLORS: Record<string, string> = {
  GET: 'text-green-400',
  POST: 'text-yellow-400',
  PUT: 'text-blue-400',
  DELETE: 'text-red-400',
  PATCH: 'text-purple-400',
};

function statusColor(status: number): string {
  if (status < 300) return 'text-green-400';
  if (status < 400) return 'text-yellow-400';
  return 'text-red-400';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function totalTiming(t: NetworkEntry['timing']): string {
  const ms = t.blocked + t.dns + t.connect + t.send + t.wait + t.receive;
  return `${ms.toFixed(2)}ms`;
}

function formatBody(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

// ─── Mock Edit Modal ──────────────────────────────────────────

function MockEditModal({
  entry,
  initialBody,
  onClose,
  onSave,
}: {
  entry: NetworkEntry;
  initialBody: string;
  onClose: () => void;
  onSave: (body: string) => void;
}) {
  const [bodyText, setBodyText] = useState(() => formatBody(initialBody));
  const [formatError, setFormatError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Focus textarea
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Escape to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Sync scroll: highlight pre follows textarea
  const handleScroll = () => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  // Real-time validation
  const liveError = (() => {
    if (!bodyText.trim()) return null;
    try {
      JSON.parse(bodyText);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  })();

  const handleFormat = () => {
    try {
      const parsed = JSON.parse(bodyText);
      setBodyText(JSON.stringify(parsed, null, 2));
      setFormatError(null);
    } catch (e) {
      setFormatError((e as Error).message);
    }
  };

  const handleSave = () => {
    if (liveError) {
      setFormatError(liveError);
      return;
    }
    setFormatError(null);
    onSave(bodyText);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Modal */}
      <div
        className="relative z-10 flex w-[90vw] max-w-5xl flex-col rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl"
        style={{ maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">Mock Response Body</h3>
            <p className="mt-1 truncate max-w-2xl text-xs font-mono text-zinc-500">{entry.url}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex shrink-0 items-center gap-3 border-b border-zinc-800 px-6 py-3">
          <button
            onClick={handleFormat}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            <Wand2 className="h-3.5 w-3.5" />
            格式化
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 rounded-md bg-violet-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-400"
          >
            保存
          </button>
        </div>

        {/* Editor with syntax highlight overlay */}
        <div className="relative min-h-0 flex-1 overflow-hidden" style={{ minHeight: '50vh' }}>
          {/* Highlighted background */}
          <pre
            ref={highlightRef}
            className="absolute inset-0 overflow-auto p-4 text-sm font-mono leading-relaxed pointer-events-none"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: highlightJSON(bodyText || '') }}
          />
          {/* Transparent textarea on top */}
          <textarea
            ref={textareaRef}
            value={bodyText}
            onChange={(e) => {
              setBodyText(e.target.value);
              setFormatError(null);
            }}
            onScroll={handleScroll}
            className="absolute inset-0 w-full h-full p-4 text-sm font-mono leading-relaxed bg-transparent text-transparent caret-zinc-200 outline-none resize-none"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
          />
        </div>

        {/* Footer: live validation */}
        {(liveError || formatError) && (
          <div className="shrink-0 border-t border-zinc-800 px-6 py-3">
            <span className="text-xs text-red-400">JSON 语法错误: {liveError || formatError}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Inline Detail (row-expanded) ─────────────────────────────

function InlineDetail({
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

// ─── Main Component ───────────────────────────────────────────

export function NetworkTab({ recordingId }: { recordingId: string }) {
  const [entries, setEntries] = useState<NetworkEntry[]>([]);
  const [rules, setRules] = useState<MockRule[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showMockModal, setShowMockModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchRecordingNetwork(recordingId),
      fetchRecordingMockRules(recordingId),
    ]).then(([net, mock]) => {
      setEntries(net.entries || []);
      setRules(mock.rules || []);
      setLoading(false);
    }).catch((e) => {
      setError(e.message);
      setLoading(false);
    });
  }, [recordingId]);

  const expandedEntry = entries.find((e) => e.id === expandedId);
  const expandedRule = rules.find((r) => r.urlPattern === expandedEntry?.url);

  const toggleMock = useCallback(async (entry: NetworkEntry) => {
    const existing = rules.findIndex((r) => r.urlPattern === entry.url);
    let newRules: MockRule[];
    if (existing >= 0) {
      newRules = rules.filter((_, i) => i !== existing);
    } else {
      newRules = [...rules, {
        urlPattern: entry.url,
        enabled: true,
        method: entry.method,
        statusCode: entry.status,
        contentType: entry.mimeType,
        responseBody: entry.responseBody,
      }];
    }
    setRules(newRules);
    setSaving(true);
    await saveRecordingMockRules(recordingId, newRules);
    setSaving(false);
  }, [recordingId, rules]);

  const updateResponseBody = useCallback(async (url: string, body: string) => {
    const newRules = rules.map((r) =>
      r.urlPattern === url ? { ...r, responseBody: body } : r,
    );
    setRules(newRules);
    setSaving(true);
    await saveRecordingMockRules(recordingId, newRules);
    setSaving(false);
  }, [recordingId, rules]);

  if (error) return <p className="text-red-400 py-8 text-center">加载失败: {error}</p>;
  if (loading) return <p className="text-zinc-500 py-8 text-center">加载网络数据中...</p>;
  if (entries.length === 0) return <p className="text-zinc-500 py-8 text-center">无网络请求记录</p>;

  return (
    <div className="min-h-[500px]">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
        {/* Table header */}
        <div className="sticky top-0 bg-zinc-900 text-zinc-500 text-xs border-b border-zinc-800">
          <div className="grid grid-cols-[4rem_1fr_4rem_5rem_4rem_2rem] items-center px-3 py-2">
            <span className="text-left">Method</span>
            <span className="text-left">URL</span>
            <span className="text-left">Status</span>
            <span className="text-left">Time</span>
            <span className="text-left">Size</span>
            <span className="text-center">Mock</span>
          </div>
        </div>

        {/* Rows */}
        {entries.map((entry) => {
          const isMocked = rules.some((r) => r.urlPattern === entry.url);
          const isExpanded = expandedId === entry.id;

          return (
            <div key={entry.id}>
              <div
                onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                className={`grid grid-cols-[4rem_1fr_4rem_5rem_4rem_2rem] items-center px-3 py-1.5 cursor-pointer transition-colors border-b border-zinc-800/50 ${
                  isExpanded
                    ? 'bg-zinc-800'
                    : 'hover:bg-zinc-800/50'
                }`}
              >
                <span className={`font-mono text-xs font-bold ${METHOD_COLORS[entry.method] ?? 'text-zinc-400'}`}>
                  {entry.method}
                </span>
                <span className="text-zinc-300 truncate text-xs" title={entry.url}>
                  {entry.url}
                </span>
                <span className={`font-mono text-xs ${statusColor(entry.status)}`}>
                  {entry.status}
                </span>
                <span className="text-zinc-500 text-xs">{entry.timing.wait}ms</span>
                <span className="text-zinc-500 text-xs">{formatSize(entry.contentSize)}</span>
                <span className="flex items-center justify-center gap-1">
                  {isMocked && (
                    <span className="rounded-full bg-yellow-500/10 px-1.5 py-0.5 text-[10px] font-bold text-yellow-400">M</span>
                  )}
                  {isExpanded ? (
                    <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
                  )}
                </span>
              </div>

              {/* Expanded detail */}
              {isExpanded && expandedEntry && (
                <InlineDetail
                  entry={expandedEntry}
                  mockRule={expandedRule}
                  onToggleMock={() => toggleMock(expandedEntry)}
                  onOpenMockEdit={() => setShowMockModal(true)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Mock Edit Modal */}
      {showMockModal && expandedEntry && (
        <MockEditModal
          entry={expandedEntry}
          initialBody={expandedRule?.responseBody ?? expandedEntry.responseBody ?? ''}
          onClose={() => setShowMockModal(false)}
          onSave={(body) => updateResponseBody(expandedEntry.url, body)}
        />
      )}

      {saving && (
        <p className="mt-2 text-center text-xs text-zinc-500">保存中...</p>
      )}
    </div>
  );
}
