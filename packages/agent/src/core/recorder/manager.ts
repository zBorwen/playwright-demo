import path from 'node:path';
import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page } from 'playwright-core';
import type { BrowserType, Recording, RecordingAction, ElementInfo } from '@playwright-demo/shared';
import { captureFingerprint } from './fingerprint';
import { transformRecorderAction } from './transformer';
import type { RecorderActionData, RecorderEventSink } from '../../types/playwright-internal';

type BrowserLauncher = typeof chromium | typeof firefox | typeof webkit;

const browserLaunchers: Record<BrowserType, BrowserLauncher> = {
  chromium,
  firefox,
  webkit,
};

export class RecorderManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private actions: RecordingAction[] = [];
  private onActionCallback: ((action: RecordingAction, code: string) => void) | null = null;
  private codegenLines: string[] = [];
  private recordingId: string = '';

  /** Register a callback that fires for every recorded action in real time. */
  onAction(callback: (action: RecordingAction, code: string) => void): void {
    this.onActionCallback = callback;
  }

  async startRecording(targetUrl: string, recordingId: string, options: {
    headless?: boolean;
    browserType?: BrowserType;
  } = {}): Promise<void> {
    this.recordingId = recordingId;
    const browserType = options.browserType ?? 'chromium';
    const headless = options.headless ?? false;

    const launcher = browserLaunchers[browserType];
    if (!launcher) throw new Error(`Unsupported browser: ${browserType}`);

    try {
      this.browser = await launcher.launch({ headless, args: ['--window-size=1280,720'] });
      this.context = await this.browser.newContext({
        noViewport: true,
        recordHar: { path: this.getHarPath() },
      });
      this.actions = [];
      this.codegenLines = [];

      const eventSink: RecorderEventSink = {
        actionAdded: async (page, data, code) => {
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
              const updated = { ...last, key: action.key ?? 'Enter' };
              this.actions[this.actions.length - 1] = updated;
              if (this.onActionCallback) this.onActionCallback(updated, code);
              
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
        actionUpdated: async (page, data, code) => {
          const action = data.action;

          if (action.name === 'fill') {
            const selector = action.selector || '';
            const lastAction = this.actions.length > 0 ? this.actions[this.actions.length - 1] : null;
            const shouldUpdate = lastAction?.name === 'fill' && lastAction.selector === selector;

            if (shouldUpdate) {
              const updated = { ...lastAction, value: action.text ?? action.value ?? '' };
              this.actions[this.actions.length - 1] = updated;
              if (this.onActionCallback) this.onActionCallback(updated, code);
            } else {
              // New typing session
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

          // Non-fill mergeable actions
          if (this.actions.length > 0) {
            const lastIdx = this.actions.length - 1;
            const last = this.actions[lastIdx];
            if (last.name === 'press' && action.key) {
              const updated = { ...last, key: action.key as string };
              this.actions[lastIdx] = updated;
              if (this.onActionCallback) this.onActionCallback(updated, code);
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
        signalAdded: async (_page, data) => {
          const signal = data as Record<string, any>;
          if (signal?.name === 'navigation' && signal.url) {
            this.codegenLines.push(`await page.goto('${signal.url}');`);
          }
        },
      };

      await this.context._enableRecorder(
        {
          mode: 'recording',
          recorderMode: 'api',
          language: 'playwright-test',
          launchOptions: { headless },
          contextOptions: {},
          handleSIGINT: false,
          hideToolbar: true,
        },
        eventSink,
      );

      const page = await this.context.newPage();
      await page
        .goto(targetUrl, { timeout: 30000, waitUntil: 'domcontentloaded' })
        .catch(() => {
          console.warn('Initial navigation may have partially failed, continuing anyway');
        });

      console.log(`Recording started on: ${page.url()}`);
    } catch (err) {
      await this.context?.close().catch(() => {});
      await this.browser?.close().catch(() => {});
      this.browser = null;
      this.context = null;
      throw err;
    }
  }

  private async handleRecorderAction(
    page: Page,
    data: RecorderActionData,
    code: string,
  ): Promise<void> {
    const action = data.action;

    // Collect codegen
    if (code) {
      this.codegenLines.push(code);
    }

    const title = await page.title().catch(() => '');
    const ts = Date.now();

    // Enrich with element fingerprint
    let elementInfo: ElementInfo | null = null;
    if (action.selector) {
      elementInfo = await captureFingerprint(page, action.selector);
    }
    if (!elementInfo) {
      elementInfo = this.defaultElementInfo(action.name);
    }

    const recordingAction = transformRecorderAction(action, page, elementInfo, ts);
    if (!recordingAction) return;
    
    // Patch title since it's hard to get inside transformer
    recordingAction.pageContext.title = title;

    this.actions.push(recordingAction);
    if (this.onActionCallback) {
      this.onActionCallback(recordingAction, code);
    }
  }

  private defaultElementInfo(_actionName: string): ElementInfo {
    return {
      dataTestId: null, dataTest: null, role: null, accessibleName: null,
      textContent: null, placeholder: null, id: null, tagName: 'html',
      labelText: null, name: null, inputType: null, classes: [],
      parentPath: ['html'], nearbyText: [], boundingBox: null, isVisible: true,
    };
  }

  async stopRecording(): Promise<{
    actions: Recording['actions'];
    harPath: string;
    codegen: string;
  }> {
    const harPath = this.getHarPath();
    const actions = [...this.actions];
    const codegen = this.codegenLines.join('\n');

    await this.context?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
    
    this.browser = null;
    this.context = null;
    this.actions = [];
    this.codegenLines = [];
    
    return { actions, harPath, codegen };
  }

  private getHarPath(): string {
    return path.resolve(process.env.STORAGE_PATH || './storage', 'recordings', this.recordingId, 'temp-recording.har');
  }
}
