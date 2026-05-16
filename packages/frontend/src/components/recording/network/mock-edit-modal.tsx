import { useState, useEffect, useRef } from 'react';
import type { NetworkEntry } from '@playwright-demo/shared';
import { Wand2, X } from 'lucide-react';
import { highlightJSON } from '@/lib/syntax-highlight';
import { formatBody } from './types';

export function MockEditModal({
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
