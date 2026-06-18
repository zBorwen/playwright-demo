import { useEffect, useRef } from 'react';

interface WsMessage {
  type: string;
  payload: unknown;
}

type Listener = (msg: WsMessage) => void;

const listeners = new Set<Listener>();
let ws: WebSocket | null = null;

export function connect(): void {
  if (ws && ws.readyState <= WebSocket.OPEN) return;

  // Dev: direct connect to backend. Prod: use relative URL (same origin).
  const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws';
  const url = wsUrl || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

  ws = new WebSocket(url);

  ws.onopen = () => { };

  ws.onmessage = (event) => {
    try {
      const msg: WsMessage = JSON.parse(event.data);
      for (const listener of listeners) {
        listener(msg);
      }
    } catch {
      // Ignore non-JSON messages (e.g., raw ping strings)
    }
  };

  ws.onclose = () => {
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

    const wrapperListener: Listener = (msg) => {
      if (onMessageRef.current) {
        onMessageRef.current(msg);
      }
    };

    listeners.add(wrapperListener);
    return () => {
      listeners.delete(wrapperListener);
    };
  }, []);
}

/** Register a message listener and return an unsubscribe function. */
export function subscribeToMessages(onMessage: (msg: WsMessage) => void): () => void {
  listeners.add(onMessage);
  return () => listeners.delete(onMessage);
}
