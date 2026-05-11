import { useEffect, useRef } from 'react';

interface WsMessage {
  type: string;
  payload: unknown;
}

type Listener = (msg: WsMessage) => void;

const listeners = new Set<Listener>();
let ws: WebSocket | null = null;

// Global single-replay progress tracker (executionId → max completed step index)
const singleReplayProgress = new Map<string, number>();

export function connect(): void {
  if (ws && ws.readyState <= WebSocket.OPEN) return;

  // Dev: direct connect to backend. Prod: use relative URL (same origin).
  const wsUrl = import.meta.env.VITE_WS_URL;
  const url = wsUrl || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

  ws = new WebSocket(url);

  ws.onopen = () => {
    console.log('WebSocket connected');
  };

  ws.onmessage = (event) => {
    try {
      const msg: WsMessage = JSON.parse(event.data);

      // Track single-replay progress globally
      if (msg.type === 'replay:step') {
        const p = msg.payload as { recordingId?: string; executionId?: string; index?: number; status?: string };
        if (p.executionId && typeof p.index === 'number') {
          if (p.status === 'completed') {
            const prev = singleReplayProgress.get(p.executionId) ?? -1;
            if (p.index > prev) singleReplayProgress.set(p.executionId, p.index);
          } else if (p.status === 'failed') {
            singleReplayProgress.delete(p.executionId);
          }
        }
      }

      for (const listener of listeners) {
        listener(msg);
      }
    } catch {
      // Ignore non-JSON messages (e.g., raw ping strings)
    }
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected, reconnecting in 3s...');
    setTimeout(connect, 3000);
  };

  ws.onerror = () => {
    ws?.close();
  };
}

export function useWebSocket(onMessage?: (msg: WsMessage) => void): void {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    connect();

    if (onMessageRef.current) {
      listeners.add(onMessageRef.current);
      return () => {
        listeners.delete(onMessageRef.current!);
      };
    }
  }, []);
}

/** Register a message listener and return an unsubscribe function. */
export function subscribeToMessages(onMessage: (msg: WsMessage) => void): () => void {
  listeners.add(onMessage);
  return () => listeners.delete(onMessage);
}

/** Get the max completed step index for a single replay execution. */
export function getSingleReplayProgress(executionId: string): number {
  return singleReplayProgress.get(executionId) ?? -1;
}
