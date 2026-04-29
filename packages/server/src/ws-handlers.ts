import type { WebSocket } from 'ws';
import type { AgentMessage } from '@playwright-demo/shared';
import { db } from './db/index.js';
import { recordings, recordingArtifacts } from './db/schema.js';
import { eq } from 'drizzle-orm';
import { StorageService } from './services/storage.js';

export class WsHandlers {
  private storage: StorageService;
  private clients: Set<WebSocket> = new Set();

  constructor(storage: StorageService) {
    this.storage = storage;
  }

  async handleAgentMessage(ws: WebSocket, msg: AgentMessage): Promise<void> {
    switch (msg.type) {
      case 'record:action': {
        this.broadcastToClients(JSON.stringify(msg));
        break;
      }

      case 'record:complete': {
        const { recordingId, actions } = msg.payload;

        try {
          // Update recording timestamp in DB
          await db
            .update(recordings)
            .set({ updatedAt: new Date() })
            .where(eq(recordings.id, recordingId));

          // Save actions artifact
          await db.insert(recordingArtifacts).values({
            recordingId,
            type: 'actions',
            content: JSON.stringify(actions),
          });

          // Save recording JSON to local storage
          const recording = await db.query.recordings.findFirst({
            where: eq(recordings.id, recordingId),
          });

          if (recording) {
            await this.storage.saveRecording(recordingId, {
              recordingId,
              targetUrl: recording.targetUrl ?? '',
              title: recording.title,
              actions,
            });
          }

          // TODO: Save HAR when agent writes it directly, storage can load by recordingId
          this.broadcastToClients(JSON.stringify(msg));
        } catch (err) {
          console.error('Failed to save recording:', err);
          const wsAny = ws as unknown as { readyState: number; send: (data: string) => void };
          if (wsAny.readyState === 1) {
            wsAny.send(JSON.stringify({ type: 'error', payload: { message: 'Failed to save recording' } }));
          }
        }
        break;
      }

      case 'replay:done': {
        // TODO: handle replay completion
        break;
      }

      default: {
        console.log('Unhandled agent message:', msg.type);
      }
    }
  }

  registerClient(ws: WebSocket): void {
    this.clients.add(ws);
  }

  unregisterClient(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  private broadcastToClients(data: string): void {
    for (const client of this.clients) {
      if (client.readyState === 1) {
        client.send(data);
      }
    }
  }
}
