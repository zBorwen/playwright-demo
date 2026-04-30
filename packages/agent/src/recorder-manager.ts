import path from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import type { Recording, RecordingAction, ElementInfo } from '@playwright-demo/shared';
import { captureFingerprint } from './fingerprint.js';

interface RecorderActionData {
  action: {
    name: string;
    selector?: string;
    url?: string;
    value?: string;
    text?: string;
    key?: string;
    options?: string[];
    checked?: boolean;
    signals?: unknown[];
  };
  frame: { pageGuid: string };
}

export class RecorderManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private actions: RecordingAction[] = [];
  private onActionCallback: ((action: RecordingAction, code: string) => void) | null = null;
  private codegenLines: string[] = [];

  /** Register a callback that fires for every recorded action in real time. The callback receives the action and its generated code. */
  onAction(callback: (action: RecordingAction, code: string) => void): void {
    this.onActionCallback = callback;
  }

  async startRecording(targetUrl: string): Promise<void> {
    this.browser = await chromium.launch({ headless: false });
    this.context = await this.browser.newContext({
      recordHar: { path: this.getHarPath() },
    });
    this.actions = [];
    this.codegenLines = [];

    const eventSink = {
      actionAdded: async (page: Page, data: RecorderActionData, code: string) => {
        const action = data.action;

        // For fill: always push a new action (actionUpdated will merge subsequent keystrokes)
        if (action.name === 'fill') {
          await this.handleRecorderAction(page, data, code);
          return;
        }

        // For non-fill: check if last action should be merged (press accumulation)
        if (action.name === 'press' && this.actions.length > 0) {
          const last = this.actions[this.actions.length - 1];
          if (last.name === 'press') {
            // Merge into existing press
            this.actions[this.actions.length - 1] = { ...last, key: action.key ?? 'Enter' };
            if (this.onActionCallback) {
              this.onActionCallback(this.actions[this.actions.length - 1], code);
            }
            if (code && this.codegenLines.length > 0) {
              this.codegenLines[this.codegenLines.length - 1] = code;
            } else if (code) {
              this.codegenLines.push(code);
            }
            return;
          }
        }

        await this.handleRecorderAction(page, data, code);
      },
      actionUpdated: async (page: Page, data: RecorderActionData, code: string) => {
        const action = data.action;

        // Fill: update the last action if it's a fill with same selector
        if (action.name === 'fill') {
          const selector = action.selector || '';
          const lastAction = this.actions.length > 0 ? this.actions[this.actions.length - 1] : null;
          const shouldUpdate = lastAction?.name === 'fill' && lastAction.selector === selector;

          if (shouldUpdate) {
            const updated = { ...lastAction, value: action.text ?? action.value ?? '' };
            this.actions[this.actions.length - 1] = updated;
            if (this.onActionCallback) {
              this.onActionCallback(updated, code);
            }
          } else {
            // New typing session — handleRecorderAction will push a new fill
            await this.handleRecorderAction(page, data, code);
          }
          // Update codegen
          if (code && this.codegenLines.length > 0) {
            this.codegenLines[this.codegenLines.length - 1] = code;
          } else if (code) {
            this.codegenLines.push(code);
          }
          return;
        }

        // Non-fill mergeable actions — update last
        if (this.actions.length > 0) {
          const lastIdx = this.actions.length - 1;
          const last = this.actions[lastIdx];
          if (last.name === 'press' && action.key) {
            this.actions[lastIdx] = { ...last, key: action.key as string };
            if (this.onActionCallback) {
              this.onActionCallback(this.actions[lastIdx], code);
            }
          }
        }
        if (code) {
          if (this.codegenLines.length > 0) {
            this.codegenLines[this.codegenLines.length - 1] = code;
          } else {
            this.codegenLines.push(code);
          }
        }
      },
      signalAdded: (page: Page, data: unknown) => {
        const signal = data as Record<string, unknown>;
        if (signal?.name === 'navigation' && signal.url) {
          this.codegenLines.push(`await page.goto('${signal.url}');`);
        }
      },
    };

    await (this.context as any)._enableRecorder(
      {
        mode: 'recording',
        recorderMode: 'api',
        language: 'playwright-test',
        launchOptions: { headless: false },
        contextOptions: {},
        handleSIGINT: false,
        hideToolbar: true,
      },
      eventSink,
    );

    const page = await this.context!.newPage();
    await page
      .goto(targetUrl, { timeout: 30000, waitUntil: 'domcontentloaded' })
      .catch(() => {
        console.warn('Initial navigation may have partially failed, continuing anyway');
      });

    console.log(`Recording started on: ${page.url()}`);
  }

  /** Process a single Recorder event: convert to RecordingAction, enrich with fingerprint, store + notify. */
  private async handleRecorderAction(
    page: Page,
    data: RecorderActionData,
    code: string,
  ): Promise<void> {
    const action = data.action;
    const actionName = action.name;

    // Collect codegen
    if (code) {
      this.codegenLines.push(code);
    }

    const url = page.url();
    const title = await page.title().catch(() => '');
    const ts = Date.now();

    // Enrich with element fingerprint
    let elementInfo: ElementInfo | null = null;
    if (action.selector) {
      elementInfo = await captureFingerprint(page, action.selector);
    }
    if (!elementInfo) {
      elementInfo = this.defaultElementInfo(actionName);
    }

    const baseFields = {
      signals: action.signals ?? [],
      elementInfo,
      pageContext: { url, title },
      timestamp: ts,
    };

    let recordingAction: Record<string, unknown> | null = null;

    switch (actionName) {
      case 'click':
        recordingAction = {
          name: 'click',
          selector: action.selector || '',
          button: 'left',
          modifiers: 0,
          clickCount: 1,
          ...baseFields,
        };
        break;

      case 'fill':
        recordingAction = {
          name: 'fill',
          selector: action.selector || '',
          value: action.value ?? action.text ?? '',
          ...baseFields,
        };
        break;

      case 'press':
        recordingAction = {
          name: 'press',
          selector: action.selector || '',
          key: action.key ?? 'Enter',
          modifiers: 0,
          ...baseFields,
        };
        break;

      case 'select':
        recordingAction = {
          name: 'select',
          selector: action.selector || '',
          options: action.options ?? [],
          ...baseFields,
        };
        break;

      case 'check':
        recordingAction = {
          name: 'check',
          selector: action.selector || '',
          ...baseFields,
        };
        break;

      case 'uncheck':
        recordingAction = {
          name: 'uncheck',
          selector: action.selector || '',
          ...baseFields,
        };
        break;

      case 'navigate':
        recordingAction = {
          name: 'navigate',
          url: action.url || url,
          ...baseFields,
        };
        break;

      case 'assertText':
        recordingAction = {
          name: 'assertText',
          selector: action.selector || '',
          text: action.text ?? '',
          ...baseFields,
        };
        break;

      case 'assertVisible':
        recordingAction = {
          name: 'assertVisible',
          selector: action.selector || '',
          ...baseFields,
        };
        break;

      case 'assertChecked':
        recordingAction = {
          name: 'assertChecked',
          selector: action.selector || '',
          checked: action.checked === true,
          ...baseFields,
        };
        break;

      case 'assertValue':
        recordingAction = {
          name: 'assertValue',
          selector: action.selector || '',
          value: action.value ?? '',
          ...baseFields,
        };
        break;

      case 'setInputFiles':
        recordingAction = {
          name: 'setInputFiles',
          selector: action.selector || '',
          files: (action.options as string[]) ?? [],
          ...baseFields,
        };
        break;
    }

    if (!recordingAction) return;

    this.actions.push(recordingAction as RecordingAction);
    if (this.onActionCallback) {
      this.onActionCallback(recordingAction as RecordingAction, code);
    }
  }

  private defaultElementInfo(_actionName: string): ElementInfo {
    return {
      dataTestId: null,
      dataTest: null,
      role: null,
      accessibleName: null,
      textContent: null,
      placeholder: null,
      id: null,
      tagName: 'html',
      labelText: null,
      name: null,
      inputType: null,
      classes: [],
      parentPath: ['html'],
      nearbyText: [],
      boundingBox: null,
      isVisible: true,
    };
  }

  async stopRecording(): Promise<{
    actions: Recording['actions'];
    harPath: string;
    codegen: string;
  }> {
    const harPath = this.getHarPath();
    await this.context?.close();
    await this.browser?.close();
    this.browser = null;
    this.context = null;

    const codegen = this.codegenLines.join('\n');
    return { actions: this.actions, harPath, codegen };
  }

  private getHarPath(): string {
    return path.resolve(process.env.STORAGE_PATH || './storage', 'temp-recording.har');
  }

  getActions(): Recording['actions'] {
    return this.actions;
  }
}
