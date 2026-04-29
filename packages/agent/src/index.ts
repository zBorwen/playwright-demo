import { WsClient } from './ws-client.js';
import { RecorderManager } from './recorder-manager.js';

const SERVER_URL = process.env.SERVER_URL || 'ws://localhost:3000/ws';
const TOKEN = process.env.AGENT_TOKEN;

async function main() {
  const ws = new WsClient(SERVER_URL, TOKEN);
  const recorder = new RecorderManager();

  ws.onMessage(async (msg) => {
    switch (msg.type) {
      case 'record:start': {
        console.log(`Starting recording: ${msg.payload.recordingId}`);
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
        // TODO: implement replay engine
        break;
      }
    }
  });

  await ws.connect();
  console.log('Agent started, waiting for commands...');
}

main().catch(console.error);
