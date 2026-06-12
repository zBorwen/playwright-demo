import { useCallback } from 'react';
import { useWebSocket } from './use-websocket';
import { useRecordingReplayStore } from '@/store/recording-replay-store';
import { saveRecordingActions, fetchRecordingCodegen, type RecordingAction, type BrowserType } from '@/lib/api';

export function useRecordingWebSocket(
  recordingId: string | undefined,
  browserType: BrowserType,
  onRecordingComplete: () => void
) {
  const handleWsMessage = useCallback((msg: { type: string; payload: unknown }) => {
    if (!recordingId) return;
    const store = useRecordingReplayStore.getState();

    switch (msg.type) {
      case 'record:action': {
        const payload = msg.payload as { recordingId: string; action: RecordingAction; code?: string };
        if (payload.recordingId !== recordingId) return;
        const action = payload.action;
        
        const activeActions = store.activeRecordingActions[recordingId] || [];

        if (action.name === 'fill' && 'selector' in action && action.selector) {
          const selector = action.selector;
          const lastAction = activeActions.length > 0 ? activeActions[activeActions.length - 1] : null;
          const shouldUpdate = lastAction?.name === 'fill' && 'selector' in lastAction && lastAction.selector === selector;

          if (shouldUpdate) {
            store.updateLastAction(recordingId, action);
          } else {
            store.appendAction(recordingId, action);
          }
        } else {
          store.appendAction(recordingId, action);
        }

        if (payload.code) {
          store.appendCodegen(recordingId, payload.code);
        }
        break;
      }
      case 'record:complete': {
        const payload = msg.payload as { recordingId: string; actions?: RecordingAction[]; codegen?: string };
        if (payload.recordingId !== recordingId) return;
        onRecordingComplete();
        
        if (payload.actions) {
          store.setActions(recordingId, payload.actions);
          if (payload.actions.length > 0) {
            saveRecordingActions(recordingId, payload.actions).catch((e) => {
              console.error('Failed to auto-save recording actions:', e);
            });
          }
        }
        
        fetchRecordingCodegen(recordingId, browserType)
          .then((r) => store.setCodegen(recordingId, r.codegen || ''))
          .catch((e) => {
            console.warn('Failed to fetch codegen:', e.message);
          });
        break;
      }
      case 'replay:artifact': {
        type ArtifactPayload = { recordingId: string; executionId: string; index: number; type: 'screenshot' | 'har' | 'trace'; path: string };
        const payload = msg.payload as ArtifactPayload;
        if (payload.recordingId !== recordingId) return;
        store.handleReplayArtifact(payload);
        break;
      }
    }
  }, [recordingId, browserType, onRecordingComplete]);

  useWebSocket(handleWsMessage);
}
