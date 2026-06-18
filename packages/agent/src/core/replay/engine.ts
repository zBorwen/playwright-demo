import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page } from 'playwright-core';
import type { BrowserType, RecordingAction, MockRule } from '@playwright-demo/shared';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { MockRouter } from './mock-router';
import { generateFallbackSelectors, type FallbackStrategy } from './selector-healer';

const HEALABLE_ACTIONS = new Set<RecordingAction['name']>([
  'click', 'fill', 'hover', 'press', 'select', 'check', 'uncheck', 'setInputFiles',
]);


type BrowserLauncher = typeof chromium | typeof firefox | typeof webkit;

const browserLaunchers: Record<BrowserType, BrowserLauncher> = {
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
  artifacts: { index: number; type: 'screenshot'; path: string }[];
}

const SCREENSHOT_ACTIONS = ['navigate', 'click', 'fill', 'select', 'check', 'uncheck', 'setInputFiles'];

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
  private artifacts: { index: number; type: 'screenshot'; path: string }[] = [];
  private onStepCallback: ((index: number, status: 'completed') => void) | null = null;
  private onStepFailedCallback: ((index: number, error: string) => void) | null = null;
  private onArtifactCallback: ((index: number, type: 'screenshot', path: string) => void) | null = null;

  private screenshotPromise = Promise.resolve();

  onStep(callback: (index: number, status: 'completed') => void): void {
    this.onStepCallback = callback;
  }

  onStepFailed(callback: (index: number, error: string) => void): void {
    this.onStepFailedCallback = callback;
  }

  onArtifact(callback: (index: number, type: 'screenshot', path: string) => void): void {
    this.onArtifactCallback = callback;
  }

  async replay(actions: RecordingAction[], options: {
    harPath?: string;
    headless?: boolean;
    recordingId?: string;
    executionId?: string;
    mockRules?: MockRule[];
    useMock?: boolean;
    stepDelay?: number;
    browserType?: BrowserType;
  } = {}): Promise<ReplayResult> {
    this.artifacts = [];
    this.screenshotPromise = Promise.resolve();

    const {
      headless = true, recordingId = 'unknown', executionId = `exec-${Date.now()}`, harPath,
      mockRules = [], useMock = false, stepDelay = 300, browserType = 'chromium',
    } = options;

    const storageBase = path.resolve(process.env.STORAGE_PATH || './storage', 'executions', executionId);
    const screenshotDir = path.join(storageBase, 'screenshots');
    const traceDir = path.join(storageBase, 'traces');

    mkdirSync(screenshotDir, { recursive: true });

    const deduplicated = deduplicateActions(actions);
    const launcher = browserLaunchers[browserType];
    if (!launcher) throw new Error(`Unsupported browser: ${browserType}`);

    this.browser = await launcher.launch({ headless, args: ['--window-size=1280,720'] });
    try {
      this.context = await this.browser.newContext({ viewport: null });
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

          // 1. Immediate status update
          if (this.onStepCallback) this.onStepCallback(i, 'completed');

          // 2. Async screenshot evidence (non-blocking)
          if (SCREENSHOT_ACTIONS.includes(action.name) || action.name.startsWith('assert')) {
            const scPath = path.join(screenshotDir, `step-${i}.jpg`);
            this.screenshotPromise = this.screenshotPromise.then(async () => {
              try {
                // Wait for stability if it's a navigation or mutation
                await page.waitForLoadState('domcontentloaded', { timeout: 1000 }).catch(() => {});
                await page.screenshot({ path: scPath, type: 'jpeg', quality: 80 });
                this.artifacts.push({ index: i, type: 'screenshot', path: scPath });
                if (this.onArtifactCallback) this.onArtifactCallback(i, 'screenshot', scPath);
              } catch (e) {
                console.warn(`[replay] failed to capture async screenshot for step ${i}:`, e);
              }
            });
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          const failPath = path.join(screenshotDir, `failure-step-${i}.jpg`);
          
          // For failure, we MUST wait for the screenshot to ensure we have the evidence
          await page.screenshot({ path: failPath, type: 'jpeg', quality: 90, fullPage: true }).catch(() => {});
          this.artifacts.push({ index: i, type: 'screenshot', path: failPath });
          
          if (this.onStepFailedCallback) this.onStepFailedCallback(i, errorMsg);
          if (this.onArtifactCallback) this.onArtifactCallback(i, 'screenshot', failPath);

          mkdirSync(traceDir, { recursive: true });
          const tracePath = path.join(traceDir, `trace-${Date.now()}.zip`);
          await this.context.tracing.stop({ path: tracePath });
          
          // Wait for pending screenshots before returning
          await this.screenshotPromise.catch(() => {});

          return {
            status: 'failed', stepIndex: i, totalSteps: deduplicated.length,
            error: errorMsg, tracePath, artifacts: this.artifacts,
          };
        }

        if (stepDelay > 0 && i < deduplicated.length - 1) {
          await new Promise((r) => setTimeout(r, stepDelay));
        }
      }

      // Wait for all async evidence to finish before closing browser
      await this.screenshotPromise.catch(() => {});
      
      await this.context.tracing.stop().catch(() => {});
      return {
        status: 'passed', stepIndex: deduplicated.length, totalSteps: deduplicated.length,
        artifacts: this.artifacts,
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
          loc.click({ button: action.button, timeout: 10000 }),
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
      default: {
        const _exhaustive: never = action;
        throw new Error(`Unknown action: ${(_exhaustive as RecordingAction).name}`);
      }
    }
  }

  private async tryHealAndRetry(page: Page, action: RecordingAction, originalError: string): Promise<void> {
    if (!HEALABLE_ACTIONS.has(action.name)) {
      throw new Error(originalError);
    }

    if (!action.elementInfo) {
      throw new Error(originalError);
    }

    const fallbacks = generateFallbackSelectors(action.elementInfo);
    if (fallbacks.length === 0) {
      throw new Error(originalError);
    }

    const selectorValue = 'selector' in action ? action.selector : '<unknown>';
    console.log(`[replay] selector "${selectorValue}" failed. Attempting heal with ${fallbacks.length} fallback(s)...`);

    for (const fb of fallbacks) {
      try {
        const locator = this.resolveLocator(page, fb);
        await locator.waitFor({ state: 'attached', timeout: 5000 });

        console.log(`[replay] heal successful with ${fb.strategy} (${JSON.stringify(fb.value)})`);
        await this.replayActionWithLocator(page, action, locator);
        return;
      } catch {
        continue;
      }
    }

    throw new Error(originalError);
  }

  private resolveLocator(page: Page, fallback: FallbackStrategy) {
    switch (fallback.strategy) {
      case 'role':
        return page.getByRole(fallback.value.role as Parameters<typeof page.getByRole>[0], {
          name: fallback.value.name,
        });
      case 'text':
        return page.getByText(fallback.value);
      case 'css':
        return page.locator(fallback.value);
    }
  }

  private async replayActionWithLocator(
    page: Page,
    action: RecordingAction,
    locator: ReturnType<typeof page.locator>,
  ): Promise<void> {
    switch (action.name) {
      case 'click':
        await locator.click({ button: action.button, timeout: 10000 });
        break;
      case 'fill':
        await locator.fill(action.value, { timeout: 10000 });
        break;
      case 'hover':
        await locator.hover({ timeout: 10000 });
        break;
      case 'press':
        await locator.press(action.key, { timeout: 10000 });
        break;
      case 'select':
        await locator.selectOption(action.options, { timeout: 10000 });
        break;
      case 'check':
        await locator.check({ timeout: 10000 });
        break;
      case 'uncheck':
        await locator.uncheck({ timeout: 10000 });
        break;
      case 'setInputFiles':
        await locator.setInputFiles(action.files, { timeout: 10000 });
        break;
    }
  }

  private async executeActionAndWait(page: Page, action: RecordingAction): Promise<void> {
    const needsNavigation = action.name === 'click' || (action.name === 'press' && action.key === 'Enter');
    if (needsNavigation) {
      const navPromise = page.waitForNavigation({ timeout: 1000 }).catch(() => null);
      try {
        await this.executeAction(page, action);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await this.tryHealAndRetry(page, action, errorMsg);
      }
      if (await navPromise) await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
    } else {
      try {
        await this.executeAction(page, action);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await this.tryHealAndRetry(page, action, errorMsg);
      }
    }
  }
}
