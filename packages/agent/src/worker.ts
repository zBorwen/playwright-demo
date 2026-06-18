import { ReplayEngine } from './core/replay/engine.js';
import { RecorderManager } from './core/recorder/manager.js';
import type { TaskMessage } from './types/tasks';

let activeRecorder: RecorderManager | null = null;
let recordTaskId: string | null = null;

/** 安全发送 IPC 消息，IPC 通道关闭时静默失败而非抛出 TypeError */
function safeSend(msg: Record<string, unknown>): void {
  if (typeof process.send === 'function') {
    process.send(msg);
  } else {
    console.error('[worker] IPC 通道已关闭，无法发送消息:', msg.type);
  }
}

process.on('message', async (msg: TaskMessage) => {
  try {
    switch (msg.type) {
      case 'task:replay': {
        const { executionId, recordingId, actions, harPath, mockRules, headless, browserType, stepDelay, useMock } = msg.payload;

        const engine = new ReplayEngine();
        engine.onStep((index, status) => {
          safeSend({
            type: 'replay:step',
            taskId: msg.id,
            payload: { executionId, recordingId, index, status },
          });
        });
        engine.onStepFailed((index, error) => {
          safeSend({
            type: 'replay:step',
            taskId: msg.id,
            payload: { executionId, recordingId, index, status: 'failed', error },
          });
        });
        engine.onArtifact((index, type, path) => {
          safeSend({
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
            executionId,
            mockRules,
            useMock,
            stepDelay,
            browserType,
          });

          safeSend({
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
          safeSend({
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
          safeSend({
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
          safeSend({
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
          safeSend({
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
          safeSend({
            type: 'record:complete',
            taskId: msg.id,
            payload: { recordingId: msg.payload.recordingId, actions, harPath, codegen },
          });
        } catch (err) {
          safeSend({
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
    safeSend({
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

process.on('uncaughtException', (err) => {
  console.error('[worker] uncaughtException:', err);
  safeSend({ type: 'error', payload: { message: `uncaughtException: ${err.message}` } });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[worker] unhandledRejection:', reason);
  const message = reason instanceof Error ? reason.message : String(reason);
  safeSend({ type: 'error', payload: { message: `unhandledRejection: ${message}` } });
  process.exit(1);
});

safeSend({ type: 'worker:ready' });

