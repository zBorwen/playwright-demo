import path from 'node:path';
import { WsClient } from './ws-client';
import { RecorderManager } from './recorder-manager';
import { ReplayEngine } from './replay-engine';
import type { AgentMessage, ServerMessage } from '@playwright-demo/shared';

const SERVER_URL = process.env.SERVER_URL || 'ws://localhost:3000/ws';
const AGENT_ID = process.env.AGENT_ID || 'default';
const TOKEN = process.env.AGENT_TOKEN;

type ReplayStartPayload = Extract<ServerMessage, { type: 'replay:start' }>['payload'];

async function main() {
  const url = new URL(SERVER_URL);
  url.searchParams.set('agentId', AGENT_ID);
  const ws = new WsClient(url.toString(), TOKEN);
  const recorder = new RecorderManager();

  // Replay queue — agent can only run one replay at a time
  let replayBusy = false;
  const replayQueue: ReplayStartPayload[] = [];

  async function processNextReplay() {
    if (replayBusy || replayQueue.length === 0) return;
    replayBusy = true;
    const payload = replayQueue.shift()!;

    console.log(`Starting replay: ${payload.recordingId}`);
    const { actions, harRef, mockRules, executionId, replaySpeed } = payload;

    const stepDelay = replaySpeed === 'fast' ? 0 : replaySpeed === 'slow' ? 1000 : 300;

    const engine = new ReplayEngine();
    engine.onStep((index, status) => {
      ws.send({ type: 'replay:step', payload: { executionId, index, status } });
    });
    engine.onStepFailed((index, error) => {
      ws.send({ type: 'replay:step', payload: { executionId, index, status: 'failed', error } });
    });
    engine.onScreenshot((stepIndex, path) => {
      ws.send({ type: 'replay:screenshot', payload: { executionId, stepIndex, path } });
    });

    const result = await engine.replay(actions as Parameters<typeof engine.replay>[0], {
      headless: false,
      recordingId: payload.recordingId,
      harPath: harRef ? path.resolve(process.env.STORAGE_PATH || './storage', harRef) : undefined,
      mockRules: mockRules || [],
      useMock: !!harRef || (mockRules && mockRules.length > 0),
      stepDelay,
    });
    ws.send({
      type: 'replay:done',
      payload: {
        executionId,
        status: result.status,
        error: result.error ?? '',
        trace: result.trace ?? '',
        tracePath: result.tracePath,
        screenshot: result.screenshots.length > 0
          ? result.screenshots[result.screenshots.length - 1].path
          : undefined,
      },
    });

    replayBusy = false;
    // Process next queued replay
    processNextReplay();
  }

  ws.onMessage(async (msg) => {
    switch (msg.type) {
      case 'record:start': {
        console.log(`Starting recording: ${msg.payload.recordingId}`);
        recorder.onAction((action, code) => {
          const agentMsg: AgentMessage = {
            type: 'record:action',
            payload: {
              action,
              code,
              selector: 'selector' in action ? (action as { selector: string }).selector : '',
              elementInfo: action.elementInfo,
              timestamp: action.timestamp,
            },
          };
          ws.send(agentMsg);
        });
        await recorder.startRecording(msg.payload.targetUrl, msg.payload.recordingId);
        break;
      }
      case 'record:stop': {
        console.log(`Stopping recording: ${msg.payload.recordingId}`);
        const { actions, harPath, codegen } = await recorder.stopRecording();
        ws.send({
          type: 'record:complete',
          payload: {
            recordingId: msg.payload.recordingId,
            actions,
            harPath,
            codegen,
          },
        });
        break;
      }
      case 'replay:start': {
        if (replayBusy) {
          console.log(`Replay busy, queuing: ${msg.payload.recordingId}`);
        }
        replayQueue.push(msg.payload);
        processNextReplay();
        break;
      }
    }
  });

  await ws.connect();
  console.log('Agent started, waiting for commands...');
}

main().catch(console.error);
