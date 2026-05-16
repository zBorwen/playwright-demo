import WebSocket from 'ws';
import type { ServerMessage, AgentMessage } from '@playwright-demo/shared';

export class WsClient {
  private ws: WebSocket | null = null;
  private url: string;
  private messageHandlers: ((msg: ServerMessage) => void)[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private token?: string;

  constructor(url: string, token?: string) {
    this.url = url;
    this.token = token;
  }

  private connecting = false;

  connect(): Promise<void> {
    if (this.connecting) {
      return Promise.resolve();
    }
    this.connecting = true;
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url, {
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      });

      this.ws.on('open', () => {
        this.connecting = false;
        console.log('Connected to server');
        this.reconnectTimer = null;
        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const msg: ServerMessage = JSON.parse(data.toString());
          if (msg.type === 'ping') {
            this.send({ type: 'pong' });
            return;
          }
          for (const handler of this.messageHandlers) {
            handler(msg);
          }
        } catch (e) {
          console.error('Failed to parse message:', e);
        }
      });

      this.ws.on('close', () => {
        console.log('Disconnected, reconnecting in 3s...');
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      });

      this.ws.on('error', (err: Error) => {
        this.connecting = false;
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
          reject(err);
        } else {
          console.error('WebSocket error:', err);
        }
      });
    });
  }

  onMessage(handler: (msg: ServerMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  send(msg: AgentMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close(): void {
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
