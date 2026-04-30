import { WsClient } from './ws-client.js';
import { RecorderManager } from './recorder-manager.js';
import { ReplayEngine } from './replay-engine.js';

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
        recorder.onAction((action) => {
          ws.send({
            type: 'record:action',
            payload: {
              action,
              selector: action.name === 'navigate' ? '' : action.selector,
              elementInfo: action.elementInfo,
              timestamp: action.timestamp,
            },
          });
        });
        await recorder.startRecording(msg.payload.targetUrl);
        break;
      }
      case 'record:stop': {
        console.log(`Stopping recording: ${msg.payload.recordingId}`);
        const { actions, harPath } = await recorder.stopRecording();
        ws.send({
          type: 'record:complete',
          payload: {
            recordingId: msg.payload.recordingId,
            actions,
            harPath,
          },
        });
        break;
      }
      case 'replay:start': {
        console.log(`Starting replay: ${msg.payload.recordingId}`);
        const { actions, harRef, mockRules } = msg.payload;

        const engine = new ReplayEngine();
        engine.onStep((index, status) => {
          ws.send({ type: 'replay:step', payload: { index, status } });
        });
        engine.onScreenshot((stepIndex, path) => {
          ws.send({ type: 'replay:screenshot', payload: { stepIndex, path } });
        });

        const result = await engine.replay(actions as any, {
          harPath: harRef ? `./storage/${harRef}` : undefined,
          mockRules: mockRules || [],
          useMock: !!harRef || (mockRules && mockRules.length > 0),
        });
        ws.send({
          type: 'replay:done',
          payload: {
            status: result.status,
            trace: result.trace,
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
