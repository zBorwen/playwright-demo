import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import type { RecordingAction } from '@playwright-demo/shared';

export interface ReplayResult {
  status: 'passed' | 'failed';
  stepIndex: number;
  totalSteps: number;
  error?: string;
  trace?: string;
  screenshots: { stepIndex: number; path: string }[];
}

export class ReplayEngine {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private screenshots: { stepIndex: number; path: string }[] = [];
  private onStepCallback: ((index: number, status: 'running') => void) | null = null;
  private onScreenshotCallback: ((stepIndex: number, path: string) => void) | null = null;

  onStep(callback: (index: number, status: 'running') => void): void {
    this.onStepCallback = callback;
  }

  onScreenshot(callback: (stepIndex: number, path: string) => void): void {
    this.onScreenshotCallback = callback;
  }

  async replay(actions: RecordingAction[], options: {
    harPath?: string;
    headless?: boolean;
    screenshotDir?: string;
  } = {}): Promise<ReplayResult> {
    this.screenshots = [];

    const { headless = true, screenshotDir = './storage/screenshots' } = options;

    this.browser = await chromium.launch({ headless });
    try {
      const contextOptions: { recordHar?: { path: string } } = {};
      if (options.harPath) {
        contextOptions.recordHar = { path: options.harPath };
      }
      this.context = await this.browser.newContext(contextOptions);
      const page = await this.context.newPage();

      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];

        try {
          await this.executeAction(page, action);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          // Auto-screenshot on failure
          const failPath = `${screenshotDir}/failure-step-${i}.png`;
          await page.screenshot({ path: failPath, fullPage: true });
          return {
            status: 'failed',
            stepIndex: i,
            totalSteps: actions.length,
            error: errorMsg,
            trace: `Failed at step ${i}: ${action.name} (${JSON.stringify(action).slice(0, 200)})`,
            screenshots: this.screenshots,
          };
        }

        // Screenshot if action has screenshot flag
        if ((action as Record<string, unknown>).screenshot === true) {
          const path = `${screenshotDir}/step-${i}.png`;
          await page.screenshot({ path, fullPage: true });
          this.screenshots.push({ stepIndex: i, path });
          if (this.onScreenshotCallback) {
            this.onScreenshotCallback(i, path);
          }
        }

        // Notify step progress
        if (this.onStepCallback) {
          this.onStepCallback(i, 'running');
        }
      }

      return {
        status: 'passed',
        stepIndex: actions.length,
        totalSteps: actions.length,
        screenshots: this.screenshots,
      };
    } finally {
      await this.context?.close();
      await this.browser?.close();
      this.browser = null;
      this.context = null;
    }
  }

  private async executeAction(page: Page, action: RecordingAction): Promise<void> {
    switch (action.name) {
      case 'navigate': {
        await page.goto(action.url, { timeout: 30000 });
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        break;
      }
      case 'click': {
        const el = await page.$(action.selector);
        if (el) {
          await el.click({ button: action.button, timeout: 10000 });
        } else {
          throw new Error(`Element not found: ${action.selector}`);
        }
        break;
      }
      case 'fill': {
        await page.fill(action.selector, action.value, { timeout: 10000 });
        break;
      }
      case 'hover': {
        await page.hover(action.selector, { timeout: 10000 });
        break;
      }
      case 'press': {
        const el = await page.$(action.selector);
        if (el) {
          await el.press(action.key, { timeout: 10000 });
        } else {
          await page.keyboard.press(action.key);
        }
        break;
      }
      case 'select': {
        await page.selectOption(action.selector, action.options, { timeout: 10000 });
        break;
      }
      case 'check': {
        await page.check(action.selector, { timeout: 10000 });
        break;
      }
      case 'uncheck': {
        await page.uncheck(action.selector, { timeout: 10000 });
        break;
      }
      case 'assertVisible': {
        const el = await page.$(action.selector);
        if (!el) throw new Error(`Element not visible: ${action.selector}`);
        const visible = await el.isVisible();
        if (!visible) throw new Error(`Element not visible: ${action.selector}`);
        break;
      }
      case 'assertText': {
        const el = await page.$(action.selector);
        if (!el) throw new Error(`Element not found: ${action.selector}`);
        const text = await el.textContent();
        const expected = action.text;
        if (action.substring) {
          if (!text?.includes(expected)) throw new Error(`Text "${expected}" not found in "${text}"`);
        } else {
          if (text?.trim() !== expected.trim()) throw new Error(`Text mismatch: expected "${expected}", got "${text}"`);
        }
        break;
      }
      case 'assertChecked': {
        const el = await page.$(action.selector);
        if (!el) throw new Error(`Element not found: ${action.selector}`);
        const checked = await el.evaluate((node) => (node as HTMLInputElement).checked);
        if (checked !== action.checked) {
          throw new Error(`Checkbox state mismatch: expected ${action.checked}, got ${checked}`);
        }
        break;
      }
      case 'assertValue': {
        const el = await page.$(action.selector);
        if (!el) throw new Error(`Element not found: ${action.selector}`);
        const value = await el.evaluate((node) => (node as HTMLInputElement).value);
        if (value !== action.value) {
          throw new Error(`Value mismatch: expected "${action.value}", got "${value}"`);
        }
        break;
      }
      case 'setInputFiles': {
        await page.setInputFiles(action.selector, action.files);
        break;
      }
      default: {
        throw new Error(`Unknown action type: ${(action as Record<string, unknown>).name}`);
      }
    }
  }
}
