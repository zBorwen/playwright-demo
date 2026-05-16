import type { WebSocket } from 'ws';
import type { AgentMessage, ServerMessage } from '@playwright-demo/shared';
import { StorageService } from './services/storage';
import { processRecordingComplete } from './services/recording-service';
import { processReplayDone, cleanupOrphanedExecutions, processReplayArtifact } from './services/execution-service';

export class WsHandlers {
  private storage: StorageService;
  private clients: Set<WebSocket> = new Set();
  private agents: Map<string, { ws: WebSocket; activeRecordingIds: Set<string> }> = new Map();

  constructor(storage: StorageService) {
    this.storage = storage;
  }

  registerAgent(agentId: string, ws: WebSocket): void {
    this.agents.set(agentId, { ws, activeRecordingIds: new Set() });
    console.log(`Agent ${agentId} registered`);
  }

  async unregisterAgent(ws: WebSocket): Promise<void> {
    for (const [id, agent] of this.agents) {
      if (agent.ws === ws) {
        // Cleanup orphaned executions
        const recordingIds = Array.from(agent.activeRecordingIds);
        if (recordingIds.length > 0) {
          console.log(`Cleaning up ${recordingIds.length} orphaned executions for agent ${id}`);
          await cleanupOrphanedExecutions(recordingIds).catch(console.error);
          
          // Notify clients
          for (const recId of recordingIds) {
            this.broadcastToClients(JSON.stringify({
              type: 'replay:done',
              payload: { recordingId: recId, status: 'failed', error: 'Agent disconnected' }
            }));
          }
        }
        
        this.agents.delete(id);
        console.log(`Agent ${id} unregistered`);
      }
    }
  }

  sendToAgent(agentId: string, msg: ServerMessage): boolean {
    const agent = this.agents.get(agentId);
    if (!agent || agent.ws.readyState !== 1) return false;
    
    // Track active tasks
    if (msg.type === 'replay:start' || msg.type === 'record:start') {
      agent.activeRecordingIds.add(msg.payload.recordingId);
    }
    
    agent.ws.send(JSON.stringify(msg));
    return true;
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
    // Find agent for tracking
    let currentAgentId: string | null = null;
    for (const [id, agent] of this.agents) {
      if (agent.ws === ws) {
        currentAgentId = id;
        break;
      }
    }

    switch (msg.type) {
      case 'record:action': {
        this.broadcastToClients(JSON.stringify(msg));
        break;
      }

      case 'record:complete': {
        const { recordingId } = msg.payload;
        if (currentAgentId) {
          this.agents.get(currentAgentId)?.activeRecordingIds.delete(recordingId);
        }

        try {
          await processRecordingComplete(this.storage, msg.payload);
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

      case 'replay:artifact': {
        try {
          const result = await processReplayArtifact(this.storage, msg.payload);
          if (result) {
            // Broadcast to frontend with server-relative path
            this.broadcastToClients(JSON.stringify({
              type: 'replay:artifact',
              payload: {
                ...msg.payload,
                path: result.serverPath,
              },
            }));
          }
        } catch (err) {
          console.error('Failed to process replay artifact:', err);
        }
        break;
      }

      case 'replay:done': {
        const { recordingId } = msg.payload;
        if (currentAgentId) {
          this.agents.get(currentAgentId)?.activeRecordingIds.delete(recordingId);
        }

        try {
          const result = await processReplayDone(this.storage, msg.payload);
          this.broadcastToClients(JSON.stringify(msg));

          // Broadcast batch-replay:result so frontend can update
          if (result) {
            this.broadcastToClients(JSON.stringify({
              type: 'batch-replay:result',
              payload: {
                ...result,
                executionId: msg.payload.executionId,
                status: msg.payload.status,
                error: msg.payload.error,
              },
            }));
          }
        } catch (err) {
          console.error('Failed to process replay done:', err);
        }
        break;
      }

      default: {
        console.log('Unhandled agent message:', msg.type);
      }
    }
  }
}
