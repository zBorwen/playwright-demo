import { ReplayEngine } from './replay-engine.js';
import { RecorderManager } from './recorder-manager.js';
import type { BrowserType, MockRule, RecordingAction } from '@playwright-demo/shared';

interface TaskReplay {
  type: 'task:replay';
  id: string;
  payload: {
    executionId: string;
    recordingId: string;
    actions: RecordingAction[];
    harPath?: string;
    mockRules: MockRule[];
    headless: boolean;
    browserType: BrowserType;
    stepDelay: number;
    useMock: boolean;
  };
}

interface TaskRecordStart {
  type: 'task:record:start';
  id: string;
  payload: {
    recordingId: string;
    targetUrl: string;
    headless: boolean;
    browserType: BrowserType;
  };
}

interface TaskRecordStop {
  type: 'task:record:stop';
  id: string;
  payload: {
    recordingId: string;
  };
}

type TaskMessage = TaskReplay | TaskRecordStart | TaskRecordStop;

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
          const selector = 'selector' in action ? action.selector : undefined;
          process.send!({
            type: 'record:action',
            taskId: msg.id,
            payload: { action, code, selector, elementInfo: action.elementInfo, timestamp: Date.now() },
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
        // Keep process alive for record:stop
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
