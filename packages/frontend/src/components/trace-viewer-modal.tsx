import { X } from 'lucide-react';

interface TraceViewerModalProps {
  traceUrl: string;
  title: string;
  onClose: () => void;
}

export function TraceViewerModal({ traceUrl, title, onClose }: TraceViewerModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="relative h-[90vh] w-[95vw] rounded-lg bg-zinc-900 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded bg-zinc-800 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-700"
        >
          <X className="h-3.5 w-3.5" /> 关闭
        </button>
        <div className="border-b border-zinc-800 px-4 py-2 text-sm text-zinc-400">
          Trace Viewer — {title}
        </div>
        <iframe
          src={`/trace-viewer/index.html?trace=${encodeURIComponent(traceUrl)}`}
          className="h-[calc(100%-40px)] w-full rounded-b-lg"
          title="Trace Viewer"
        />
      </div>
    </div>
  );
}
