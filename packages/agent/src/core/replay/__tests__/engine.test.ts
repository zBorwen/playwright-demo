import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReplayEngine } from '../engine.js';
import { chromium } from 'playwright-core';
import type { RecordingAction } from '@playwright-demo/shared';

/** 用默认值补全 RecordingAction 的必填扩展字段（signals/elementInfo/timestamp） */
function mkAction<T extends Record<string, unknown>>(action: T): RecordingAction {
  const base: Record<string, unknown> = {
    signals: [],
    elementInfo: {
      dataTestId: null, dataTest: null, role: null, accessibleName: null,
      textContent: null, placeholder: null, id: null, tagName: 'DIV',
      labelText: null, name: null, inputType: null, classes: [],
      parentPath: [], nearbyText: [], boundingBox: null, isVisible: true,
    },
    pageContext: { url: '', title: '' },
    timestamp: Date.now(),
  };
  return { ...base, ...action } as unknown as RecordingAction;
}

// Mock node:fs to avoid actual directory creation
vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// Mock playwright-core
vi.mock('playwright-core', () => {
  const mockLocator = {
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    hover: vi.fn().mockResolvedValue(undefined),
    press: vi.fn().mockResolvedValue(undefined),
    selectOption: vi.fn().mockResolvedValue(undefined),
    check: vi.fn().mockResolvedValue(undefined),
    uncheck: vi.fn().mockResolvedValue(undefined),
    waitFor: vi.fn().mockResolvedValue(undefined),
    textContent: vi.fn().mockResolvedValue('hello text'),
    isChecked: vi.fn().mockResolvedValue(true),
    inputValue: vi.fn().mockResolvedValue('some value'),
    setInputFiles: vi.fn().mockResolvedValue(undefined),
    first: vi.fn(),
  };
  mockLocator.first.mockImplementation(() => mockLocator);

  const mockPage = {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForLoadState: vi.fn().mockResolvedValue(undefined),
    waitForNavigation: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from('img')),
    locator: vi.fn(() => mockLocator),
    getByRole: vi.fn(() => mockLocator),
    getByText: vi.fn(() => mockLocator),
    route: vi.fn().mockResolvedValue(undefined),
    keyboard: {
      press: vi.fn().mockResolvedValue(undefined),
    },
  };

  const mockContext = {
    newPage: vi.fn().mockResolvedValue(mockPage),
    tracing: {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    },
    close: vi.fn().mockResolvedValue(undefined),
  };

  const mockBrowser = {
    newContext: vi.fn().mockResolvedValue(mockContext),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const launcher = {
    launch: vi.fn().mockResolvedValue(mockBrowser),
  };

  return {
    chromium: launcher,
    firefox: launcher,
    webkit: launcher,
  };
});

describe('ReplayEngine', () => {
  let engine: ReplayEngine;
  let mockBrowser: any;
  let mockContext: any;
  let mockPage: any;
  let mockLocator: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    engine = new ReplayEngine();

    mockBrowser = await chromium.launch();
    mockContext = await mockBrowser.newContext();
    mockPage = await mockContext.newPage();
    mockLocator = mockPage.locator('dummy');

    // Reset default mock implementations
    mockLocator.click.mockReset().mockResolvedValue(undefined);
    mockLocator.fill.mockReset().mockResolvedValue(undefined);
    mockLocator.hover.mockReset().mockResolvedValue(undefined);
    mockLocator.press.mockReset().mockResolvedValue(undefined);
    mockLocator.selectOption.mockReset().mockResolvedValue(undefined);
    mockLocator.check.mockReset().mockResolvedValue(undefined);
    mockLocator.uncheck.mockReset().mockResolvedValue(undefined);
    mockLocator.waitFor.mockReset().mockResolvedValue(undefined);
    mockLocator.textContent.mockReset().mockResolvedValue('hello text');
    mockLocator.isChecked.mockReset().mockResolvedValue(true);
    mockLocator.inputValue.mockReset().mockResolvedValue('some value');
    mockLocator.setInputFiles.mockReset().mockResolvedValue(undefined);
    
    mockPage.goto.mockReset().mockResolvedValue(undefined);
    mockPage.screenshot.mockReset().mockResolvedValue(Buffer.from('img'));
    mockPage.locator.mockClear().mockReturnValue(mockLocator);
    mockPage.getByRole.mockClear().mockReturnValue(mockLocator);
    mockPage.getByText.mockClear().mockReturnValue(mockLocator);
  });

  it('runs replay with basic actions successfully', async () => {
    const actions: RecordingAction[] = [
      mkAction({ name: 'navigate', url: 'https://example.com' }),
      mkAction({ name: 'click', selector: 'button.submit', button: 'left' }),
      mkAction({ name: 'fill', selector: 'input.username', value: 'admin' }),
    ];

    const result = await engine.replay(actions, {
      browserType: 'chromium',
      headless: true,
      stepDelay: 0,
    });

    expect(result.status).toBe('passed');
    expect(result.totalSteps).toBe(3);
    expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', expect.any(Object));
    expect(mockPage.locator).toHaveBeenCalledWith('button.submit');
    expect(mockLocator.click).toHaveBeenCalled();
    expect(mockPage.locator).toHaveBeenCalledWith('input.username');
    expect(mockLocator.fill).toHaveBeenCalledWith('admin', expect.any(Object));
  });

  it('filters redundant Enter press followed by click (deduplication)', async () => {
    const actions: RecordingAction[] = [
      mkAction({ name: 'press', selector: 'input', key: 'Enter', timestamp: 1000 }),
      mkAction({ name: 'click', selector: 'button', button: 'left', timestamp: 1020 }),
    ];

    const result = await engine.replay(actions, { stepDelay: 0 });

    expect(result.status).toBe('passed');
    expect(result.totalSteps).toBe(1); // The click action is deduplicated, press Enter is kept
    expect(mockLocator.press).toHaveBeenCalled();
    expect(mockLocator.click).not.toHaveBeenCalled();
  });

  it('runs assert actions correctly', async () => {
    const actions: RecordingAction[] = [
      mkAction({ name: 'assertVisible', selector: '.popup' }),
      mkAction({ name: 'assertText', selector: '.title', text: 'Welcome', substring: true }),
      mkAction({ name: 'assertChecked', selector: '.agree', checked: true }),
      mkAction({ name: 'assertValue', selector: '.input', value: 'hello' }),
    ];

    mockLocator.textContent.mockResolvedValue('Welcome Admin');
    mockLocator.isChecked.mockResolvedValue(true);
    mockLocator.inputValue.mockResolvedValue('hello');

    const result = await engine.replay(actions, { stepDelay: 0 });

    expect(result.status).toBe('passed');
    expect(mockLocator.waitFor).toHaveBeenCalledWith({ state: 'visible', timeout: 10000 });
    expect(mockLocator.textContent).toHaveBeenCalled();
    expect(mockLocator.isChecked).toHaveBeenCalled();
    expect(mockLocator.inputValue).toHaveBeenCalled();
  });

  it('fails assertText if text content mismatch', async () => {
    const actions: RecordingAction[] = [
      mkAction({ name: 'assertText', selector: '.title', text: 'Welcome', substring: false }),
    ];
    mockLocator.textContent.mockResolvedValue('mismatch');

    const result = await engine.replay(actions, { stepDelay: 0 });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('Expected "Welcome", got "mismatch"');
  });

  it('handles setInputFiles action', async () => {
    const actions: RecordingAction[] = [
      mkAction({ name: 'setInputFiles', selector: 'input[type=file]', files: ['file1.txt'] }),
    ];

    const result = await engine.replay(actions, { stepDelay: 0 });
    expect(result.status).toBe('passed');
    expect(mockLocator.setInputFiles).toHaveBeenCalledWith(['file1.txt'], expect.any(Object));
  });

  it('attempts selector healing when regular click fails', async () => {
    const actions: RecordingAction[] = [
      mkAction({
        name: 'click',
        selector: '.fragile-css',
        button: 'left',
        elementInfo: {
          role: 'button',
          accessibleName: 'Submit Form',
          dataTestId: null,
          dataTest: null,
          id: null,
          placeholder: null,
          tagName: 'BUTTON',
          labelText: null,
          name: null,
          inputType: null,
          classes: [],
          parentPath: [],
          nearbyText: [],
          boundingBox: null,
          isVisible: true,
          textContent: 'Submit',
        },
      }),
    ];

    // Regular selector fails
    mockLocator.click.mockRejectedValueOnce(new Error('Element not found'));
    
    // Fallback locator succeeds
    mockLocator.click.mockResolvedValueOnce(undefined);

    const result = await engine.replay(actions, { stepDelay: 0 });

    expect(result.status).toBe('passed');
    // healing uses getByRole fallback
    expect(mockPage.getByRole).toHaveBeenCalledWith('button', { name: 'Submit Form' });
    expect(mockLocator.waitFor).toHaveBeenCalledWith({ state: 'attached', timeout: 5000 });
  });

  it('falls back to strict mode .first() on strict mode violation', async () => {
    const actions: RecordingAction[] = [
      mkAction({ name: 'click', selector: '.duplicate-class', button: 'left' }),
    ];

    mockLocator.click
      .mockRejectedValueOnce(new Error('strict mode violation: resolved to 3 elements'))
      .mockResolvedValueOnce(undefined);

    const result = await engine.replay(actions, { stepDelay: 0 });

    expect(result.status).toBe('passed');
    expect(mockLocator.first).toHaveBeenCalled();
  });

  it('fails replay if action fails and no healing is possible', async () => {
    const actions: RecordingAction[] = [
      mkAction({ name: 'click', selector: '.non-existent', button: 'left' }),
    ];
    mockLocator.click.mockRejectedValue(new Error('locator failed'));

    const result = await engine.replay(actions, { stepDelay: 0 });

    expect(result.status).toBe('failed');
    expect(result.error).toBe('locator failed');
  });
});
