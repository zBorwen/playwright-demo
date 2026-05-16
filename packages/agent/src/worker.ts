import { ReplayEngine } from './core/replay/engine.js';
import { RecorderManager } from './core/recorder/manager.js';
import type { TaskMessage } from './types/tasks';

let activeRecorder: RecorderManager | null = null;
let recordTaskId: string | null = null;

process.on('message', async (msg: TaskMessage) => {
  try {
    switch (msg.type) {
      case 'task:replay': {
        const { executionId, recordingId, actions, harPath, mockRules, headless, browserType, stepDelay, useMock } = msg.payload;

        const engine = new ReplayEngine();
        engine.onStep((index, status) => {
          process.send!({
            type: 'replay:step',
            taskId: msg.id,
            payload: { executionId, recordingId, index, status },
          });
        });
        engine.onStepFailed((index, error) => {
          process.send!({
            type: 'replay:step:failed',
            taskId: msg.id,
            payload: { executionId, recordingId, index, status: 'failed', error },
          });
        });
        engine.onArtifact((index, type, path) => {
          process.send!({
            type: 'replay:artifact',
            taskId: msg.id,
            payload: { executionId, recordingId, index, type, path },
          });
        });

        try {
          const result = await engine.replay(actions, {
            harPath,
            headless,
            recordingId,
            mockRules,
            useMock,
            stepDelay,
            browserType,
          });

          process.send!({
            type: 'replay:done',
            taskId: msg.id,
            payload: {
              executionId,
              recordingId,
              status: result.status,
              error: result.error,
              tracePath: result.tracePath,
              trace: result.trace,
            },
          });
        } catch (err) {
          process.send!({
            type: 'error',
            taskId: msg.id,
            payload: { executionId, recordingId, message: err instanceof Error ? err.message : String(err) },
          });
        }
        process.exit(0);
        break;
      }

      case 'task:record:start': {
        const { recordingId, targetUrl, headless, browserType } = msg.payload;

        activeRecorder = new RecorderManager();
        recordTaskId = msg.id;
        activeRecorder.onAction((action, code) => {
          process.send!({
            type: 'record:action',
            taskId: msg.id,
            payload: { 
              action, code, 
              selector: 'selector' in action ? action.selector : undefined,
              elementInfo: action.elementInfo, 
              timestamp: Date.now() 
            },
          });
        });

        try {
          await activeRecorder.startRecording(targetUrl, recordingId, { headless, browserType });
        } catch (err) {
          process.send!({
            type: 'error',
            taskId: msg.id,
            payload: { recordingId, message: err instanceof Error ? err.message : String(err) },
          });
          process.exit(1);
        }
        break;
      }

      case 'task:record:stop': {
        if (!activeRecorder) {
          process.send!({
            type: 'error',
            taskId: msg.id,
            payload: { recordingId: msg.payload.recordingId, message: 'No active recording' },
          });
          process.exit(0);
          break;
        }

        if (recordTaskId !== msg.id) {
          console.warn(`[worker] Received stop for ${msg.id} but current task is ${recordTaskId}. Ignoring.`);
          break;
        }

        try {
          const { actions, harPath, codegen } = await activeRecorder.stopRecording();
          process.send!({
            type: 'record:complete',
            taskId: msg.id,
            payload: { recordingId: msg.payload.recordingId, actions, harPath, codegen },
          });
        } catch (err) {
          process.send!({
            type: 'error',
            taskId: msg.id,
            payload: { recordingId: msg.payload.recordingId, message: err instanceof Error ? err.message : String(err) },
          });
        } finally {
          activeRecorder = null;
          recordTaskId = null;
        }
        process.exit(0);
        break;
      }
    }
  } catch (err) {
    process.send!({
      type: 'error',
      taskId: 'id' in msg ? msg.id : undefined,
      payload: { message: err instanceof Error ? err.message : String(err) },
    });
    process.exit(1);
  }
});

process.on('SIGTERM', () => {
  activeRecorder?.stopRecording().catch(() => {});
  process.exit(0);
});

process.send!({ type: 'worker:ready' });
