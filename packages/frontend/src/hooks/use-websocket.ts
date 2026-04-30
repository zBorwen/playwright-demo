import { useEffect, useRef } from 'react';

interface WsMessage {
  type: string;
  payload: unknown;
}

type Listener = (msg: WsMessage) => void;

const listeners = new Set<Listener>();
let ws: WebSocket | null = null;

function connect(): void {
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

export function addWsListener(listener: Listener): void {
  listeners.add(listener);
}

export function removeWsListener(listener: Listener): void {
  listeners.delete(listener);
}
