import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import type { Recording } from '@playwright-demo/shared';
import { captureFingerprint } from './fingerprint.js';

export class RecorderManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private actions: Recording['actions'] = [];

  async startRecording(targetUrl: string): Promise<void> {
    this.browser = await chromium.launch({ headless: false });
    this.context = await this.browser.newContext({
      recordHar: { path: `${process.env.STORAGE_PATH || './storage'}/temp-recording.har` },
    });
    this.actions = [];

    const page = await this.context.newPage();
    await page.goto(targetUrl);

    // TODO: Hook into playwright-core internal recorder API
    // For now, capture navigation events as a placeholder

    page.on('framenavigated', async (frame) => {
      if (frame === page.mainFrame()) {
        const fingerprint = await captureFingerprint(page, 'html');
        if (fingerprint) {
          this.actions.push({
            name: 'navigate',
            url: frame.url(),
            signals: [],
            elementInfo: fingerprint,
            pageContext: { url: frame.url(), title: await page.title() },
            timestamp: Date.now(),
          });
        }
      }
    });
  }

  async stopRecording(): Promise<{ actions: Recording['actions']; harPath: string }> {
    const harPath = `${process.env.STORAGE_PATH || './storage'}/temp-recording.har`;
    await this.context?.close();
    await this.browser?.close();
    this.browser = null;
    this.context = null;

    return { actions: this.actions, harPath };
  }

  getActions(): Recording['actions'] {
    return this.actions;
  }
}
