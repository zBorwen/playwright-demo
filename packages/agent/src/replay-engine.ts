import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page, type Route } from 'playwright-core';
import type { BrowserType, RecordingAction, MockRule } from '@playwright-demo/shared';

const browserLaunchers: Record<BrowserType, typeof chromium> = {
  chromium,
  firefox,
  webkit,
};
import { readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'node:path';

interface ReplayResult {
  status: 'passed' | 'failed';
  stepIndex: number;
  totalSteps: number;
  error?: string;
  trace?: string;
  tracePath?: string;
  screenshots: { stepIndex: number; path: string }[];
}

interface HarEntry {
  request: { url: string; method: string };
  response: { status: number; content: { text: string; mimeType: string } };
}

interface HarFile {
  log: {
    entries: HarEntry[];
  };
}

function loadHarEntries(harPath: string): HarEntry[] {
  if (!existsSync(harPath)) return [];
  try {
    const content = JSON.parse(readFileSync(harPath, 'utf-8')) as HarFile;
    return content.log.entries;
  } catch (err) {
    console.warn(`Failed to parse HAR file: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

function matchRule(url: string, method: string, rules: MockRule[]): MockRule | undefined {
  return rules.find((r) => {
    if (!r.enabled) return false;
    if (r.method && r.method !== method) return false;
    const pattern = new RegExp(r.urlPattern);
    return pattern.test(url);
  });
}

async function handleMockRoute(route: Route, rules: MockRule[], harEntries: HarEntry[]): Promise<void> {
  const request = route.request();
  const url = request.url();

  // Skip non-HTTP/HTTPS URLs
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    await route.continue();
    return;
  }

  // Check mock rules first (with method matching)
  const matchedRule = matchRule(url, request.method(), rules);
  if (matchedRule && matchedRule.responseBody !== undefined) {
    await route.fulfill({
      status: matchedRule.statusCode ?? 200,
      contentType: matchedRule.contentType ?? 'application/json',
      headers: matchedRule.responseHeaders,
      body: matchedRule.responseBody,
    });
    return;
  }

  // Fall back to HAR entries
  if (harEntries.length > 0) {
    const matched = harEntries.find((entry) => {
      const entryUrl = entry.request.url;
      return entryUrl === url || entryUrl.includes(url.split('?')[0] || '');
    });
    if (matched) {
      await route.fulfill({
        status: matched.response.status,
        contentType: matched.response.content.mimeType,
        body: matched.response.content.text,
      });
      return;
    }
  }

  // No match — continue real request
  await route.continue();
}

/**
 * When Enter press on a form field is immediately followed (<50ms) by a click
 * on the submit/login button, the recording captured both but in practice only
 * the click triggers the actual submission. Skip the redundant press to avoid conflicts.
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
      action.name === 'press' &&
      action.key === 'Enter' &&
      next &&
      next.name === 'click' &&
      action.timestamp &&
      next.timestamp &&
      next.timestamp - action.timestamp < 50
    ) {
      console.log(`[replay] deduplicate: skipping press Enter (step ${i}), keeping click (step ${i + 1})`);
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
    this.screenshots = [];

    const {
      headless = true,
      recordingId = 'unknown',
      harPath,
      mockRules = [],
      useMock = false,
      stepDelay = 300,
      browserType = 'chromium',
    } = options;

    const storageBase = path.resolve(process.env.STORAGE_PATH || './storage', 'recordings', recordingId);
    const screenshotDir = path.join(storageBase, 'screenshots');
    const traceDir = path.join(storageBase, 'traces');

    const harEntries = harPath && useMock ? loadHarEntries(harPath) : [];

    // Deduplicate near-simultaneous actions (Enter + click on form submit)
    const deduplicated = deduplicateActions(actions);

    const launcher = browserLaunchers[browserType];
    if (!launcher) throw new Error(`Unsupported browser: ${browserType}`);

    this.browser = await launcher.launch({ headless });
    try {
      this.context = await this.browser.newContext();
      await this.context.tracing.start({ screenshots: true, snapshots: true });
      const page = await this.context.newPage();

      // Set up mock/route interception if enabled
      if (useMock) {
        await page.route('**/*', async (route: Route) => {
          await handleMockRoute(route, mockRules, harEntries);
        });
      }

      for (let i = 0; i < deduplicated.length; i++) {
        const action = deduplicated[i];

        try {
          console.log(`[replay] executing step ${i}/${deduplicated.length}: ${action.name}`);
          await this.executeActionAndWait(page, action);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          const failPath = `${screenshotDir}/failure-step-${i}.png`;
          await page.screenshot({ path: failPath, fullPage: true });
          if (this.onStepFailedCallback) {
            this.onStepFailedCallback(i, errorMsg);
          }
          // Stop tracing and save trace file for failed replay
          mkdirSync(traceDir, { recursive: true });
          const tracePath = path.join(traceDir, `trace-${Date.now()}.zip`);
          await this.context.tracing.stop({ path: tracePath });
          return {
            status: 'failed',
            stepIndex: i,
            totalSteps: deduplicated.length,
            error: errorMsg,
            trace: `Failed at step ${i}: ${action.name} (${JSON.stringify(action).slice(0, 200)})`,
            tracePath,
            screenshots: this.screenshots,
          };
        }

        if (this.onStepCallback) {
          this.onStepCallback(i, 'completed');
        }

        // Delay between steps for visibility (skip on last step)
        if (stepDelay > 0 && i < deduplicated.length - 1) {
          await new Promise((r) => setTimeout(r, stepDelay));
        }
      }

      // Passed — stop tracing (discard trace for successful replay)
      await this.context.tracing.stop().catch(() => {});

      return {
        status: 'passed',
        stepIndex: deduplicated.length,
        totalSteps: deduplicated.length,
        screenshots: this.screenshots,
      };
    } finally {
      await this.context?.close();
      await this.browser?.close();
      this.browser = null;
      this.context = null;
    }
  }

  /** Execute a locator action with strict-mode-violation fallback to .first(). */
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
      if (msg.includes('strict mode violation') || msg.includes('strict mode')) {
        console.log(`[replay] strict mode violation on selector "${selector}", falling back to .first()`);
        return await action(locator.first());
      } else {
        throw err;
      }
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
          loc.click({ button: action.button as 'left' | 'right' | 'middle' | undefined, timeout: 10000 }),
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
        // Default to substring matching (matches Playwright codegen behavior)
        if (action.substring === false) {
          if (text?.trim() !== expected.trim()) throw new Error(`Text mismatch: expected "${expected}", got "${text}"`);
        } else {
          if (!text?.includes(expected)) throw new Error(`Text "${expected}" not found in "${text}"`);
        }
        break;
      }
      case 'assertChecked': {
        const checked = await page.locator(action.selector).isChecked({ timeout: 10000 });
        if (checked !== action.checked) {
          throw new Error(`Checkbox state mismatch: expected ${action.checked}, got ${checked}`);
        }
        break;
      }
      case 'assertValue': {
        const value = await page.locator(action.selector).inputValue({ timeout: 10000 });
        if (value !== action.value) {
          throw new Error(`Value mismatch: expected "${action.value}", got "${value}"`);
        }
        break;
      }
      case 'setInputFiles': {
        await this.withStrictModeFallback(page, action.selector, (loc) =>
          loc.setInputFiles(action.files, { timeout: 10000 }),
        );
        break;
      }
      default: {
        throw new Error(`Unknown action type: ${(action as Record<string, unknown>).name}`);
      }
    }
  }

  private async executeActionAndWait(page: Page, action: RecordingAction): Promise<void> {
    // Only wait for navigation on actions that are likely to cause it
    const needsNavigation = action.name === 'click' ||
      (action.name === 'press' && action.key === 'Enter');

    if (needsNavigation) {
      const navPromise = page.waitForNavigation({ timeout: 1000 }).catch(() => null);
      await this.executeAction(page, action);
      const navResult = await navPromise;
      if (navResult) {
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
      }
    } else {
      // Non-navigation actions execute immediately — no artificial delay
      await this.executeAction(page, action);
    }
  }
}
