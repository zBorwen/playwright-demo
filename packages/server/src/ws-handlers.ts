import type { WebSocket } from 'ws';
import type { AgentMessage, ServerMessage } from '@playwright-demo/shared';
import { readFile } from 'fs/promises';
import { db } from './db/index';
import { recordings, recordingArtifacts, executions } from './db/schema';
import { eq, and } from 'drizzle-orm';
import { StorageService } from './services/storage';

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

  broadcastToClients(data: string, exclude?: WebSocket): void {
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
        const { recordingId, actions, harPath, codegen } = msg.payload;

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

              const { parseAndFilterHar } = await import('./services/har-filter');
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

      case 'replay:step': {
        this.broadcastToClients(JSON.stringify(msg));
        break;
      }

      case 'replay:screenshot': {
        this.broadcastToClients(JSON.stringify(msg));
        break;
      }

      case 'replay:done': {
        const { executionId, status, error, trace, screenshot, tracePath } = msg.payload;

        // Save trace file from agent to storage
        if (tracePath) {
          try {
            const traceBuffer = await readFile(tracePath);
            await this.storage.saveTrace(executionId, traceBuffer);
          } catch (err) {
            console.error('Failed to save trace file:', err);
          }
        }

        // Look up recordingId for batch replay progress updates
        const exec = await db
          .select({ recordingId: executions.recordingId })
          .from(executions)
          .where(eq(executions.id, executionId))
          .limit(1);

        // Update execution in DB
        await db
          .update(executions)
          .set({
            status,
            error: error ?? null,
            trace: tracePath ? `executions/${executionId}/trace.zip` : (screenshot ?? null),
            finishedAt: new Date(),
          })
          .where(eq(executions.id, executionId));

        this.broadcastToClients(JSON.stringify(msg));

        // Broadcast batch-replay:result so frontend batch panel can update
        if (exec.length) {
          const recording = await db
            .select({ title: recordings.title })
            .from(recordings)
            .where(eq(recordings.id, exec[0].recordingId))
            .limit(1);
          this.broadcastToClients(JSON.stringify({
            type: 'batch-replay:result',
            payload: {
              recordingId: exec[0].recordingId,
              recordingTitle: recording[0]?.title,
              executionId,
              status: status === 'passed' ? 'passed' : 'failed',
              error: error ?? undefined,
            },
          }));
        }
        break;
      }

      default: {
        console.log('Unhandled agent message:', msg.type);
      }
    }
  }
}
