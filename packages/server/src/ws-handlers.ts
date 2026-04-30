import type { WebSocket } from 'ws';
import type { AgentMessage, ServerMessage } from '@playwright-demo/shared';
import { readFile } from 'fs/promises';
import { db } from './db/index.js';
import { recordings, recordingArtifacts } from './db/schema.js';
import { eq, and } from 'drizzle-orm';
import { StorageService } from './services/storage.js';

export class WsHandlers {
  private storage: StorageService;
  private clients: Set<WebSocket> = new Set();
  private agents: Map<string, WebSocket> = new Map();

  constructor(storage: StorageService) {
    this.storage = storage;
  }

  registerAgent(agentId: string, ws: WebSocket): void {
    this.agents.set(agentId, ws);
    console.log(`Agent ${agentId} registered`);
  }

  unregisterAgent(ws: WebSocket): void {
    for (const [id, agentWs] of this.agents) {
      if (agentWs === ws) {
        this.agents.delete(id);
        console.log(`Agent ${id} unregistered`);
      }
    }
  }

  sendToAgent(agentId: string, msg: ServerMessage): boolean {
    const ws = this.agents.get(agentId);
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }

  getConnectedAgents(): string[] {
    return Array.from(this.agents.keys());
  }

  private broadcastToClients(data: string, exclude?: WebSocket): void {
    for (const client of this.clients) {
      if (client !== exclude && client.readyState === 1) {
        client.send(data);
      }
    }
  }

  registerClient(ws: WebSocket): void {
    this.clients.add(ws);
  }

  unregisterClient(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  async handleAgentMessage(ws: WebSocket, msg: AgentMessage): Promise<void> {
    switch (msg.type) {
      case 'record:action': {
        this.broadcastToClients(JSON.stringify(msg));
        break;
      }

      case 'record:complete': {
        const { recordingId, actions, harPath } = msg.payload;

        try {
          await db
            .update(recordings)
            .set({ updatedAt: new Date() })
            .where(eq(recordings.id, recordingId));

          // Upsert: delete only actions artifact, preserve har and mock_rules
          await db
            .delete(recordingArtifacts)
            .where(and(
              eq(recordingArtifacts.recordingId, recordingId),
              eq(recordingArtifacts.type, 'actions'),
            ));

          await db.insert(recordingArtifacts).values({
            recordingId,
            type: 'actions',
            content: JSON.stringify({ recordingId, actions }),
          });

          // Process HAR if available
          if (harPath) {
            try {
              const harBuffer = await readFile(harPath);
              await this.storage.saveHar(recordingId, harBuffer);

              const { parseAndFilterHar } = await import('./services/har-filter.js');
              const entries = await parseAndFilterHar(harPath);

              await db.insert(recordingArtifacts).values({
                recordingId,
                type: 'har',
                content: JSON.stringify(entries),
              });

              console.log(`HAR processed: ${entries.length} network entries for recording ${recordingId}`);
            } catch (err) {
              console.error('Failed to process HAR:', err);
            }
          }

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

          // Broadcast with codegen included for real-time display
          this.broadcastToClients(JSON.stringify(msg));
        } catch (err) {
          console.error('Failed to save recording:', err);
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({ type: 'error', payload: { message: 'Failed to save recording' } }));
          }
        }
        break;
      }

      case 'replay:done': {
        this.broadcastToClients(JSON.stringify(msg));
        break;
      }

      default: {
        console.log('Unhandled agent message:', msg.type);
      }
    }
  }
}
