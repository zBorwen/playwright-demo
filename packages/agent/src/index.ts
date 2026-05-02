import path from 'node:path';
import { WsClient } from './ws-client';
import { RecorderManager } from './recorder-manager';
import { ReplayEngine } from './replay-engine';
import type { AgentMessage } from '@playwright-demo/shared';

const SERVER_URL = process.env.SERVER_URL || 'ws://localhost:3000/ws';
const AGENT_ID = process.env.AGENT_ID || 'default';
const TOKEN = process.env.AGENT_TOKEN;

async function main() {
  const url = new URL(SERVER_URL);
  url.searchParams.set('agentId', AGENT_ID);
  const ws = new WsClient(url.toString(), TOKEN);
  const recorder = new RecorderManager();

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
        await recorder.startRecording(msg.payload.targetUrl);
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
        console.log(`Starting replay: ${msg.payload.recordingId}`);
        const { actions, harRef, mockRules, executionId } = msg.payload;

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
          harPath: harRef ? path.resolve(process.env.STORAGE_PATH || './storage', harRef) : undefined,
          mockRules: mockRules || [],
          useMock: !!harRef || (mockRules && mockRules.length > 0),
        });
        ws.send({
          type: 'replay:done',
          payload: {
            executionId,
            status: result.status,
            error: result.error ?? '',
            trace: result.trace ?? '',
            screenshot: result.screenshots.length > 0
              ? result.screenshots[result.screenshots.length - 1].path
              : undefined,
          },
        });
        break;
      }
    }
  });

  await ws.connect();
  console.log('Agent started, waiting for commands...');
}

main().catch(console.error);
