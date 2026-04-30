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
        // For fill actions, wait for actionUpdated with the complete accumulated text
        if (data.action.name === 'fill') {
          return;
        }
        await this.handleRecorderAction(page, data, code);
      },
      actionUpdated: async (page: Page, data: RecorderActionData, code: string) => {
        const action = data.action;

        // Fill: find existing by selector, or create new
        if (action.name === 'fill') {
          const selector = action.selector || '';
          const existingIdx = this.actions.findLastIndex(
            (a) => a.name === 'fill' && a.selector === selector,
          );

          if (existingIdx >= 0) {
            // Update existing fill with latest accumulated text
            const updated = { ...this.actions[existingIdx], value: action.text ?? action.value ?? '' };
            this.actions[existingIdx] = updated;
            if (this.onActionCallback) {
              this.onActionCallback(updated, code);
            }
          } else {
            // First time seeing this fill — create it
            await this.handleRecorderAction(page, data, code);
          }
          // Always update the last codegen line (actionUpdated replaces it)
          if (code && this.codegenLines.length > 0) {
            this.codegenLines[this.codegenLines.length - 1] = code;
          } else if (code) {
            this.codegenLines.push(code);
          }
          return;
        }

        // Non-fill mergeable actions (press, double-click, etc.) — update last action
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
      signalAdded: (_page: Page, data: unknown) => {
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
      signals: (action.signals as any[]) || [],
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

    // For fill: check if an identical selector already exists — update instead of push
    if (actionName === 'fill') {
      const existingIdx = this.actions.findLastIndex(
        (a) => a.name === 'fill' && a.selector === recordingAction!.selector,
      );
      console.log(`[handleRecorderAction fill] selector="${recordingAction.selector}", existingIdx=${existingIdx}, actions.length=${this.actions.length}`);
      if (existingIdx >= 0) {
        // Update existing fill value
        this.actions[existingIdx] = { ...this.actions[existingIdx], value: recordingAction.value } as RecordingAction;
        if (this.onActionCallback) {
          this.onActionCallback(this.actions[existingIdx], code);
        }
        return;
      }
    }

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
    return `${process.env.STORAGE_PATH || './storage'}/temp-recording.har`;
  }

  getActions(): Recording['actions'] {
    return this.actions;
  }
}
