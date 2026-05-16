import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page } from 'playwright-core';
import type { BrowserType, RecordingAction, MockRule } from '@playwright-demo/shared';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { MockRouter } from './mock-router';

const browserLaunchers: Record<BrowserType, typeof chromium> = {
  chromium,
  firefox,
  webkit,
};

interface ReplayResult {
  status: 'passed' | 'failed';
  stepIndex: number;
  totalSteps: number;
  error?: string;
  trace?: string;
  tracePath?: string;
  screenshots: { stepIndex: number; path: string }[];
}

/**
 * Skip redundant enter-press that is immediately followed by a click.
 */
function deduplicateActions(actions: RecordingAction[]): RecordingAction[] {
  const result: RecordingAction[] = [];
  let skipNext = false;

  for (let i = 0; i < actions.length; i++) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    const action = actions[i];
    const next = actions[i + 1];
    if (
      action.name === 'press' && action.key === 'Enter' &&
      next?.name === 'click' &&
      action.timestamp && next.timestamp &&
      next.timestamp - action.timestamp < 50
    ) {
      console.log(`[replay] deduplicate: skipping redundant press Enter (step ${i})`);
      skipNext = true;
    }
    result.push(action);
  }
  return result;
}

export class ReplayEngine {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private screenshots: { stepIndex: number; path: string }[] = [];
  private onStepCallback: ((index: number, status: 'completed') => void) | null = null;
  private onStepFailedCallback: ((index: number, error: string) => void) | null = null;

  onStep(callback: (index: number, status: 'completed') => void): void {
    this.onStepCallback = callback;
  }

  onStepFailed(callback: (index: number, error: string) => void): void {
    this.onStepFailedCallback = callback;
  }

  async replay(actions: RecordingAction[], options: {
    harPath?: string;
    headless?: boolean;
    recordingId?: string;
    mockRules?: MockRule[];
    useMock?: boolean;
    stepDelay?: number;
    browserType?: BrowserType;
  } = {}): Promise<ReplayResult> {
    const {
      headless = true, recordingId = 'unknown', harPath,
      mockRules = [], useMock = false, stepDelay = 300, browserType = 'chromium',
    } = options;

    const storageBase = path.resolve(process.env.STORAGE_PATH || './storage', 'recordings', recordingId);
    const screenshotDir = path.join(storageBase, 'screenshots');
    const traceDir = path.join(storageBase, 'traces');

    const deduplicated = deduplicateActions(actions);
    const launcher = browserLaunchers[browserType];
    if (!launcher) throw new Error(`Unsupported browser: ${browserType}`);

    this.browser = await launcher.launch({ headless });
    try {
      this.context = await this.browser.newContext();
      await this.context.tracing.start({ screenshots: true, snapshots: true });
      const page = await this.context.newPage();

      if (useMock) {
        const router = new MockRouter(mockRules, harPath);
        await page.route('**/*', (route) => router.handleRoute(route));
      }

      for (let i = 0; i < deduplicated.length; i++) {
        const action = deduplicated[i];
        try {
          console.log(`[replay] executing step ${i}/${deduplicated.length}: ${action.name}`);
          await this.executeActionAndWait(page, action);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          mkdirSync(screenshotDir, { recursive: true });
          const failPath = path.join(screenshotDir, `failure-step-${i}.png`);
          await page.screenshot({ path: failPath, fullPage: true });
          
          if (this.onStepFailedCallback) this.onStepFailedCallback(i, errorMsg);

          mkdirSync(traceDir, { recursive: true });
          const tracePath = path.join(traceDir, `trace-${Date.now()}.zip`);
          await this.context.tracing.stop({ path: tracePath });
          
          return {
            status: 'failed', stepIndex: i, totalSteps: deduplicated.length,
            error: errorMsg, tracePath, screenshots: this.screenshots,
          };
        }

        if (this.onStepCallback) this.onStepCallback(i, 'completed');
        if (stepDelay > 0 && i < deduplicated.length - 1) {
          await new Promise((r) => setTimeout(r, stepDelay));
        }
      }

      await this.context.tracing.stop().catch(() => {});
      return {
        status: 'passed', stepIndex: deduplicated.length, totalSteps: deduplicated.length,
        screenshots: this.screenshots,
      };
    } finally {
      await this.context?.close();
      await this.browser?.close();
      this.browser = null;
      this.context = null;
    }
  }

  private async withStrictModeFallback<T>(
    page: Page,
    selector: string,
    action: (loc: ReturnType<Page['locator']>) => Promise<T>,
  ): Promise<T | undefined> {
    const locator = page.locator(selector);
    try {
      return await action(locator);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('strict mode violation')) {
        console.log(`[replay] fallback to .first() for "${selector}"`);
        return await action(locator.first());
      }
      throw err;
    }
  }

  private async executeAction(page: Page, action: RecordingAction): Promise<void> {
    switch (action.name) {
      case 'navigate': {
        await page.goto(action.url, { timeout: 30000, waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        break;
      }
      case 'click': {
        await this.withStrictModeFallback(page, action.selector, (loc) =>
          loc.click({ button: action.button as any, timeout: 10000 }),
        );
        break;
      }
      case 'fill': {
        await this.withStrictModeFallback(page, action.selector, (loc) =>
          loc.fill(action.value, { timeout: 10000 }),
        );
        break;
      }
      case 'hover': {
        await this.withStrictModeFallback(page, action.selector, (loc) =>
          loc.hover({ timeout: 10000 }),
        );
        break;
      }
      case 'press': {
        await this.withStrictModeFallback(page, action.selector, (loc) =>
          loc.press(action.key, { timeout: 10000 }),
        ).catch(async () => {
          await page.keyboard.press(action.key);
        });
        break;
      }
      case 'select': {
        await this.withStrictModeFallback(page, action.selector, (loc) =>
          loc.selectOption(action.options, { timeout: 10000 }),
        );
        break;
      }
      case 'check': {
        await this.withStrictModeFallback(page, action.selector, (loc) =>
          loc.check({ timeout: 10000 }),
        );
        break;
      }
      case 'uncheck': {
        await this.withStrictModeFallback(page, action.selector, (loc) =>
          loc.uncheck({ timeout: 10000 }),
        );
        break;
      }
      case 'assertVisible': {
        await this.withStrictModeFallback(page, action.selector, (loc) =>
          loc.waitFor({ state: 'visible', timeout: 10000 }),
        );
        break;
      }
      case 'assertText': {
        const text = await page.locator(action.selector).textContent({ timeout: 10000 });
        const expected = action.text;
        if (action.substring === false) {
          if (text?.trim() !== expected.trim()) throw new Error(`Expected "${expected}", got "${text}"`);
        } else {
          if (!text?.includes(expected)) throw new Error(`Text "${expected}" not found in "${text}"`);
        }
        break;
      }
      case 'assertChecked': {
        const checked = await page.locator(action.selector).isChecked({ timeout: 10000 });
        if (checked !== action.checked) throw new Error(`Expected ${action.checked}, got ${checked}`);
        break;
      }
      case 'assertValue': {
        const value = await page.locator(action.selector).inputValue({ timeout: 10000 });
        if (value !== action.value) throw new Error(`Expected "${action.value}", got "${value}"`);
        break;
      }
      case 'setInputFiles': {
        await this.withStrictModeFallback(page, action.selector, (loc) =>
          loc.setInputFiles(action.files, { timeout: 10000 }),
        );
        break;
      }
      default: throw new Error(`Unknown action: ${(action as any).name}`);
    }
  }

  private async executeActionAndWait(page: Page, action: RecordingAction): Promise<void> {
    const needsNavigation = action.name === 'click' || (action.name === 'press' && action.key === 'Enter');
    if (needsNavigation) {
      const navPromise = page.waitForNavigation({ timeout: 1000 }).catch(() => null);
      await this.executeAction(page, action);
      if (await navPromise) await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
    } else {
      await this.executeAction(page, action);
    }
  }
}
