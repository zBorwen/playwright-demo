import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecorderManager } from '../manager.js';
import { chromium } from 'playwright-core';
import { captureFingerprint } from '../fingerprint.js';

// Mock path and fs to avoid disk access
vi.mock('node:path', () => ({
  default: {
    resolve: (...args: string[]) => args.join('/'),
  },
}));

// Mock playwright-core
vi.mock('playwright-core', () => {
  let capturedSink: any = null;

  const mockPage = {
    goto: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockReturnValue('https://example.com'),
    title: vi.fn().mockResolvedValue('Example Page'),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const mockContext = {
    _enableRecorder: vi.fn().mockImplementation((options, eventSink) => {
      capturedSink = eventSink;
      return Promise.resolve();
    }),
    newPage: vi.fn().mockResolvedValue(mockPage),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const mockBrowser = {
    newContext: vi.fn().mockResolvedValue(mockContext),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const launcher: any = {
    launch: vi.fn().mockResolvedValue(mockBrowser),
    getCapturedEventSink: () => capturedSink,
    resetCapturedEventSink: () => { capturedSink = null; },
  };

  return {
    chromium: launcher,
    firefox: launcher,
    webkit: launcher,
  };
});

// Mock fingerprint capture to return static element information
vi.mock('../fingerprint.js', () => ({
  captureFingerprint: vi.fn().mockResolvedValue({
    dataTestId: 'test-button',
    dataTest: null,
    role: 'button',
    accessibleName: 'Submit Form',
    textContent: 'Submit',
    placeholder: null,
    id: 'submit-id',
    tagName: 'BUTTON',
    labelText: null,
    name: 'btn',
    inputType: null,
    classes: ['btn', 'btn-primary'],
    parentPath: ['div', 'form'],
    nearbyText: [],
    boundingBox: { x: 10, y: 20, width: 100, height: 30 },
    isVisible: true,
  }),
}));

describe('RecorderManager', () => {
  let manager: RecorderManager;
  let mockBrowser: any;
  let mockContext: any;
  let mockPage: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    (chromium as any).resetCapturedEventSink();
    manager = new RecorderManager();

    mockBrowser = await chromium.launch();
    mockContext = await mockBrowser.newContext();
    mockPage = await mockContext.newPage();

    mockPage.goto.mockReset().mockResolvedValue(undefined);
    mockPage.title.mockReset().mockResolvedValue('Example Page');
    mockPage.close.mockReset().mockResolvedValue(undefined);
    mockContext._enableRecorder.mockClear();
    mockContext.close.mockClear();
    mockBrowser.close.mockClear();
  });

  const getSink = () => (chromium as any).getCapturedEventSink();

  it('starts recording and enables playwright recorder eventSink', async () => {
    await manager.startRecording('https://example.com', 'rec-123', {
      headless: true,
      browserType: 'chromium',
    });

    expect(chromium.launch).toHaveBeenCalledWith({ headless: true });
    expect(mockBrowser.newContext).toHaveBeenCalled();
    expect(mockContext._enableRecorder).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'recording', recorderMode: 'api' }),
      expect.any(Object)
    );
    expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', expect.any(Object));
    expect(getSink()).not.toBeNull();
  });

  it('collects actions when actionAdded is triggered', async () => {
    await manager.startRecording('https://example.com', 'rec-123');
    const sink = getSink();

    const mockCallback = vi.fn();
    manager.onAction(mockCallback);

    const playwrightAction = {
      action: {
        name: 'click' as const,
        selector: 'button#submit',
        button: 'left' as const,
        modifiers: 0,
        clickCount: 1,
      },
    };

    await sink.actionAdded(mockPage as any, playwrightAction, 'await page.click("button#submit");');

    expect(captureFingerprint).toHaveBeenCalledWith(mockPage, 'button#submit');
    expect(mockCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'click',
        selector: 'button#submit',
      }),
      'await page.click("button#submit");'
    );
  });

  it('merges multiple keystrokes in actionUpdated for fill action', async () => {
    await manager.startRecording('https://example.com', 'rec-123');
    const sink = getSink();

    const mockCallback = vi.fn();
    manager.onAction(mockCallback);

    // 1. Initial keystroke (actionAdded)
    await sink.actionAdded(
      mockPage as any,
      { action: { name: 'fill' as const, selector: 'input', text: 'h', value: 'h' } },
      'await page.fill("input", "h");'
    );

    // 2. Updated keystroke (actionUpdated)
    await sink.actionUpdated(
      mockPage as any,
      { action: { name: 'fill' as const, selector: 'input', text: 'he', value: 'he' } },
      'await page.fill("input", "he");'
    );

    // 3. Third keystroke (actionUpdated)
    await sink.actionUpdated(
      mockPage as any,
      { action: { name: 'fill' as const, selector: 'input', text: 'hel', value: 'hel' } },
      'await page.fill("input", "hel");'
    );

    const { actions, codegen } = await manager.stopRecording();

    // Verify it merged all keystrokes into a single action
    expect(actions.length).toBe(1);
    expect((actions[0] as any).value).toBe('hel');
    expect(codegen).toBe('await page.fill("input", "hel");');
  });

  it('merges press key events', async () => {
    await manager.startRecording('https://example.com', 'rec-123');
    const sink = getSink();

    // 1. Initial press key event
    await sink.actionAdded(
      mockPage as any,
      { action: { name: 'press' as const, selector: 'input', key: 'Enter', modifiers: 0 } },
      'await page.press("input", "Enter");'
    );

    // 2. Continuous press updates
    await sink.actionUpdated(
      mockPage as any,
      { action: { name: 'press' as const, selector: 'input', key: 'Tab', modifiers: 0 } },
      'await page.press("input", "Tab");'
    );

    const { actions } = await manager.stopRecording();
    expect(actions.length).toBe(1);
    expect((actions[0] as any).key).toBe('Tab');
  });

  it('captures navigation signals', async () => {
    await manager.startRecording('https://example.com', 'rec-123');
    const sink = getSink();

    await sink.signalAdded(mockPage as any, { name: 'navigation', url: 'https://new-url.com' });

    const { codegen } = await manager.stopRecording();
    expect(codegen).toContain("await page.goto('https://new-url.com');");
  });

  it('cleans up resources when stopRecording is called', async () => {
    await manager.startRecording('https://example.com', 'rec-123');
    const result = await manager.stopRecording();

    expect(mockContext.close).toHaveBeenCalled();
    expect(mockBrowser.close).toHaveBeenCalled();
    expect(result.harPath).toContain('temp-recording.har');
  });
});
