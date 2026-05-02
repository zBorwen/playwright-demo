import { chromium, type Browser, type BrowserContext, type Page, type Route } from 'playwright-core';
import type { RecordingAction, MockRule } from '@playwright-demo/shared';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';

export interface ReplayResult {
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

export class ReplayEngine {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private screenshots: { stepIndex: number; path: string }[] = [];
  private onStepCallback: ((index: number, status: 'completed') => void) | null = null;
  private onStepFailedCallback: ((index: number, error: string) => void) | null = null;
  private onScreenshotCallback: ((stepIndex: number, path: string) => void) | null = null;

  onStep(callback: (index: number, status: 'completed') => void): void {
    this.onStepCallback = callback;
  }

  onStepFailed(callback: (index: number, error: string) => void): void {
    this.onStepFailedCallback = callback;
  }

  onScreenshot(callback: (stepIndex: number, path: string) => void): void {
    this.onScreenshotCallback = callback;
  }

  async replay(actions: RecordingAction[], options: {
    harPath?: string;
    headless?: boolean;
    screenshotDir?: string;
    traceDir?: string;
    mockRules?: MockRule[];
    useMock?: boolean;
  } = {}): Promise<ReplayResult> {
    this.screenshots = [];

    const {
      headless = true,
      screenshotDir = './storage/screenshots',
      traceDir = './storage/traces',
      harPath,
      mockRules = [],
      useMock = false,
    } = options;

    const harEntries = harPath && useMock ? loadHarEntries(harPath) : [];

    this.browser = await chromium.launch({ headless });
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

      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];

        try {
          await this.executeAction(page, action);
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
            totalSteps: actions.length,
            error: errorMsg,
            trace: `Failed at step ${i}: ${action.name} (${JSON.stringify(action).slice(0, 200)})`,
            tracePath,
            screenshots: this.screenshots,
          };
        }

        if ((action as Record<string, unknown>).screenshot === true) {
          const path = `${screenshotDir}/step-${i}.png`;
          await page.screenshot({ path, fullPage: true });
          this.screenshots.push({ stepIndex: i, path });
          if (this.onScreenshotCallback) {
            this.onScreenshotCallback(i, path);
          }
        }

        if (this.onStepCallback) {
          this.onStepCallback(i, 'completed');
        }
      }

      // Passed — stop tracing (discard trace for successful replay)
      await this.context.tracing.stop().catch(() => {});

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
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
          // networkidle may fail on SPAs, continue anyway
        });
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
