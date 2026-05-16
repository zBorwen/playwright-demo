import { useState, useEffect, useCallback } from 'react';
import type { NetworkEntry, MockRule } from '@playwright-demo/shared';
import {
  fetchRecordingNetwork,
  fetchRecordingMockRules,
  saveRecordingMockRules,
} from '@/lib/api';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { METHOD_COLORS, statusColor, formatSize } from './network/types';
import { MockEditModal } from './network/mock-edit-modal';
import { InlineDetail } from './network/inline-detail';

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
