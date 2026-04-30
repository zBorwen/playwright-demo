import { useState, useEffect, useCallback } from 'react';
import type { NetworkEntry, MockRule } from '@playwright-demo/shared';
import {
  fetchRecordingNetwork,
  fetchRecordingMockRules,
  saveRecordingMockRules,
} from '@/lib/api';

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

function totalTiming(t: NetworkEntry['timing']): number {
  return t.blocked + t.dns + t.connect + t.send + t.wait + t.receive;
}

// ─── Detail Panel ─────────────────────────────────────────────

function EntryDetailPanel({
  entry,
  mockRule,
  onToggleMock,
  onResponseBodyChange,
}: {
  entry: NetworkEntry;
  mockRule?: MockRule;
  onToggleMock: () => void;
  onResponseBodyChange: (body: string) => void;
}) {
  const isMocked = !!mockRule;
  const [bodyText, setBodyText] = useState(mockRule?.responseBody ?? entry.responseBody ?? '');

  useEffect(() => {
    setBodyText(mockRule?.responseBody ?? entry.responseBody ?? '');
  }, [entry.id, mockRule?.responseBody, entry.responseBody]);

  return (
    <div className="rounded border border-zinc-700 bg-zinc-900 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm text-zinc-100 truncate">{entry.url}</span>
        <label className="flex items-center gap-1.5 text-xs text-zinc-400 shrink-0">
          <input
            type="checkbox"
            checked={isMocked}
            onChange={onToggleMock}
            className="rounded border-zinc-600 bg-zinc-800"
          />
          Mock
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
        <span>Method: <span className="text-zinc-200">{entry.method}</span></span>
        <span>Status: <span className={statusColor(entry.status)}>{entry.status} {entry.statusText}</span></span>
        <span>Type: <span className="text-zinc-200 font-mono">{entry.mimeType}</span></span>
        <span>Size: <span className="text-zinc-200">{formatSize(entry.contentSize)}</span></span>
        <span>Wait: <span className="text-zinc-200">{entry.timing.wait}ms</span></span>
        <span>Total: <span className="text-zinc-200">{totalTiming(entry.timing)}ms</span></span>
      </div>
      {isMocked && (
        <div>
          <label className="text-xs text-zinc-400 block mb-1">Mock Response Body</label>
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            onBlur={() => onResponseBodyChange(bodyText)}
            rows={8}
            className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 font-mono text-xs text-zinc-300"
          />
        </div>
      )}
      {entry.responseBody && (
        <details>
          <summary className="text-xs text-zinc-500 cursor-pointer">原始响应</summary>
          <pre className="mt-1 max-h-48 overflow-auto text-xs text-zinc-400 font-mono whitespace-pre-wrap break-all">
            {entry.responseBody}
          </pre>
        </details>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────

export function NetworkTab({ recordingId }: { recordingId: string }) {
  const [entries, setEntries] = useState<NetworkEntry[]>([]);
  const [rules, setRules] = useState<MockRule[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchRecordingNetwork(recordingId),
      fetchRecordingMockRules(recordingId),
    ]).then(([net, mock]) => {
      setEntries(net.entries || []);
      setRules(mock.rules || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [recordingId]);

  const selectedEntry = entries.find((e) => e.id === selectedId);
  const selectedRule = rules.find((r) => r.urlPattern === selectedEntry?.url);

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

  if (loading) return <p className="text-zinc-500 py-8 text-center">加载网络数据中...</p>;
  if (entries.length === 0) return <p className="text-zinc-500 py-8 text-center">无网络请求记录</p>;

  return (
    <div className="flex gap-4" style={{ minHeight: '500px' }}>
      {/* Entry list */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-zinc-950 text-zinc-500 text-xs">
            <tr className="border-b border-zinc-800">
              <th className="text-left px-2 py-1 w-16">Method</th>
              <th className="text-left px-2 py-1">URL</th>
              <th className="text-left px-2 py-1 w-16">Status</th>
              <th className="text-left px-2 py-1 w-20">Time</th>
              <th className="text-left px-2 py-1 w-16">Size</th>
              <th className="text-left px-2 py-1 w-12">Mock</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const isMocked = rules.some((r) => r.urlPattern === entry.url);
              return (
                <tr
                  key={entry.id}
                  onClick={() => setSelectedId(entry.id)}
                  className={`border-b border-zinc-800 cursor-pointer transition hover:bg-zinc-900 ${
                    selectedId === entry.id ? 'bg-zinc-800' : ''
                  }`}
                >
                  <td className={`px-2 py-1 font-mono text-xs font-bold ${METHOD_COLORS[entry.method] ?? 'text-zinc-400'}`}>
                    {entry.method}
                  </td>
                  <td className="px-2 py-1 text-zinc-300 truncate max-w-[400px]" title={entry.url}>
                    {entry.url}
                  </td>
                  <td className={`px-2 py-1 font-mono text-xs ${statusColor(entry.status)}`}>
                    {entry.status}
                  </td>
                  <td className="px-2 py-1 text-zinc-500 text-xs">{entry.timing.wait}ms</td>
                  <td className="px-2 py-1 text-zinc-500 text-xs">{formatSize(entry.contentSize)}</td>
                  <td className="px-2 py-1 text-center">
                    {isMocked && <span className="text-yellow-400 text-xs font-bold">M</span>}
                    {saving && selectedId === entry.id && <span className="text-zinc-600 text-xs">…</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail panel */}
      {selectedEntry && (
        <div className="w-96 shrink-0 overflow-auto">
          <EntryDetailPanel
            entry={selectedEntry}
            mockRule={selectedRule}
            onToggleMock={() => toggleMock(selectedEntry)}
            onResponseBodyChange={(body) => updateResponseBody(selectedEntry.url, body)}
          />
        </div>
      )}
    </div>
  );
}
