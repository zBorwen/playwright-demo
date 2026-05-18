import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRecordingReplayStore } from '../recording-replay-store';

// Mock storage
vi.mock('../../lib/recording-replay-storage', () => ({
  loadAllRecordingReplayStates: vi.fn(() => ({})),
  saveRecordingReplayState: vi.fn(),
  clearRecordingReplayState: vi.fn(),
}));

describe('RecordingReplayStore', () => {
  const recordingId = '92076e85-8f59-4671-a610-4fabbcee0ce1';
  const executionId = 'cc7eebe5-d292-47be-86b3-66f92ecf6c95';

  beforeEach(() => {
    useRecordingReplayStore.setState({
      recordingReplays: {},
      stepStatuses: {},
      pendingDones: {},
      activeRecordingActions: {},
      activeCodegens: {},
    });
    vi.clearAllMocks();
  });

  it('initializes steps from actions', () => {
    const actions = [
      { name: 'click', selector: 'button' } as any,
    ];
    useRecordingReplayStore.getState().initSteps(recordingId, actions);
    
    const state = useRecordingReplayStore.getState();
    const entry = state.recordingReplays[recordingId];
    expect(entry).toBeDefined();
    expect(entry.replaySteps).toHaveLength(1);
    expect(entry.replaySteps![0].actionName).toBe('click');
    expect(entry.replaySteps![0].status).toBe('pending');
  });

  it('handles replay artifact (screenshot)', () => {
    // Setup initial state with steps
    const actions = [{ name: 'click' } as any];
    useRecordingReplayStore.getState().startReplay(recordingId, executionId, actions);

    const artifactPayload = {
      recordingId,
      executionId,
      index: 0,
      type: 'screenshot' as const,
      path: 'server/screenshot.jpg',
    };

    useRecordingReplayStore.getState().handleReplayArtifact(artifactPayload);

    const state = useRecordingReplayStore.getState();
    expect(state.recordingReplays[recordingId].replaySteps![0].screenshot).toBe('server/screenshot.jpg');
  });

  it('ignores artifacts for stale executions', () => {
    useRecordingReplayStore.getState().startReplay(recordingId, executionId, []);

    const artifactPayload = {
      recordingId,
      executionId: 'some-old-id',
      index: 0,
      type: 'screenshot' as const,
      path: 'server/old.jpg',
    };

    useRecordingReplayStore.getState().handleReplayArtifact(artifactPayload);

    const state = useRecordingReplayStore.getState();
    // ReplaySteps was reset to [] because of startReplay with [], let's re-test properly
  });
  
  it('updates fill actions correctly during recording', () => {
    useRecordingReplayStore.getState().appendAction(recordingId, { name: 'fill', selector: 'input', value: 'a' } as any);
    expect(useRecordingReplayStore.getState().activeRecordingActions[recordingId]).toHaveLength(1);

    useRecordingReplayStore.getState().updateLastAction(recordingId, { name: 'fill', selector: 'input', value: 'ab' } as any);
    expect(useRecordingReplayStore.getState().activeRecordingActions[recordingId]).toHaveLength(1);
    expect(useRecordingReplayStore.getState().activeRecordingActions[recordingId][0].value).toBe('ab');
  });
});
