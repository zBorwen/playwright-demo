import { WsClient } from './comms/ws-client';
import { WorkerPool } from './pool/worker-pool';
import type { AgentMessage, BrowserType, RecordingAction } from '@playwright-demo/shared';
import type { TaskReplayPayload } from './types/tasks';

const SERVER_URL = process.env.SERVER_URL || 'ws://localhost:3000/ws';
const AGENT_ID = process.env.AGENT_ID || 'default';
const TOKEN = process.env.AGENT_TOKEN;

async function main() {
  const url = new URL(SERVER_URL);
  url.searchParams.set('agentId', AGENT_ID);
  const ws = new WsClient(url.toString(), TOKEN);
  const pool = new WorkerPool();

  // Forward worker IPC messages to server via WebSocket
  pool.setOnMessage((msg) => {
    switch (msg.type as string) {
      case 'replay:step':
      case 'replay:step:failed': {
        const stepP = msg.payload as { executionId: string; recordingId: string; index: number; status: 'completed' | 'failed'; error?: string };
        if (msg.type === 'replay:step:failed') {
          stepP.status = 'failed';
        }
        ws.send({ type: 'replay:step', payload: stepP });
        break;
      }
      case 'replay:artifact': {
        const artP = msg.payload as { executionId: string; recordingId: string; index: number; type: 'screenshot' | 'har' | 'trace'; path: string };
        ws.send({ type: 'replay:artifact', payload: artP });
        break;
      }
      case 'replay:done': {
        const doneP = msg.payload as { executionId: string; recordingId: string; status: 'passed' | 'failed'; error?: string; trace?: string; tracePath?: string; screenshot?: string };
        ws.send({
          type: 'replay:done',
          payload: {
            executionId: doneP.executionId,
            recordingId: doneP.recordingId,
            status: doneP.status,
            error: doneP.error ?? '',
            trace: doneP.trace ?? '',
            tracePath: doneP.tracePath,
            screenshot: doneP.screenshot,
          },
        });
        break;
      }
      case 'record:action': {
        const recP = msg.payload as { action: RecordingAction; code: string; selector: string; timestamp: number };
        const agentMsg: AgentMessage = {
          type: 'record:action',
          payload: {
            recordingId: msg.taskId as string,
            action: recP.action,
            code: recP.code,
            selector: recP.selector,
            elementInfo: recP.action.elementInfo,
            timestamp: recP.timestamp,
          },
        };
        ws.send(agentMsg);
        break;
      }
      case 'record:complete': {
        const compP = msg.payload as { recordingId: string; actions: RecordingAction[]; harPath: string; codegen: string };
        ws.send({ type: 'record:complete', payload: compP });
        break;
      }
      case 'error': {
        console.error(`Worker error: ${JSON.stringify(msg.payload)}`);
        break;
      }
    }
  });

  ws.onMessage(async (msg) => {
    switch (msg.type) {
      case 'record:start': {
        console.log(`[manager] Starting recording: ${msg.payload.recordingId}`);
        pool.submit({
          type: 'task:record:start',
          id: msg.payload.recordingId,
          payload: {
            recordingId: msg.payload.recordingId,
            targetUrl: msg.payload.targetUrl,
            headless: msg.payload.headless ?? true,
            browserType: msg.payload.browserType ?? 'chromium',
          },
        });
        break;
      }
      case 'record:stop': {
        console.log(`[manager] Stopping recording: ${msg.payload.recordingId}`);
        pool.sendToRecording('task:record:stop', {
          recordingId: msg.payload.recordingId,
        });
        break;
      }
      case 'replay:start': {
        const payload = msg.payload as TaskReplayPayload;
        const speed = payload.replaySpeed;
        const stepDelay = speed === 'fast' ? 0 : speed === 'slow' ? 1000 : 300;

        console.log(`[manager] Submitting replay: ${payload.recordingId} (pool busy: ${pool.activeCount}, queued: ${pool.queueLength})`);
        pool.submit({
          type: 'task:replay',
          id: payload.executionId,
          payload: {
            ...payload,
            harPath: payload.harRef ? `${process.env.STORAGE_PATH || './storage'}/recordings/${payload.recordingId}/${payload.harRef}` : undefined,
            useMock: !!payload.harRef || (payload.mockRules && payload.mockRules.length > 0),
            browserType: payload.browserType as BrowserType,
            stepDelay,
          },
        });
        break;
      }
    }
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('[manager] Shutting down...');
    pool.shutdown();
    ws.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('[manager] Shutting down...');
    pool.shutdown();
    ws.close();
    process.exit(0);
  });

  process.on('uncaughtException', (err) => {
    console.error('[manager] uncaughtException:', err);
    pool.shutdown();
    ws.close();
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[manager] unhandledRejection:', reason);
    pool.shutdown();
    ws.close();
    process.exit(1);
  });

  await ws.connect();
  console.log(`[manager] Agent started, waiting for commands...`);
}

main().catch(console.error);
