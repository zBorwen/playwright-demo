import type { Route } from 'playwright-core';
import type { MockRule } from '@playwright-demo/shared';
import { readFileSync, existsSync } from 'node:fs';

export interface HarEntry {
  request: { url: string; method: string };
  response: { status: number; content: { text: string; mimeType: string } };
}

export interface HarFile {
  log: {
    entries: HarEntry[];
  };
}

export class MockRouter {
  private rules: MockRule[] = [];
  private harEntries: HarEntry[] = [];

  constructor(rules: MockRule[] = [], harPath?: string) {
    this.rules = rules;
    if (harPath && existsSync(harPath)) {
      try {
        const content = JSON.parse(readFileSync(harPath, 'utf-8')) as HarFile;
        this.harEntries = content.log.entries;
      } catch (err) {
        console.warn(`[MockRouter] Failed to parse HAR file: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  async handleRoute(route: Route): Promise<void> {
    const request = route.request();
    const url = request.url();
    const method = request.method();

    // Skip non-HTTP/HTTPS URLs
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return route.continue();
    }

    // 1. Try explicit Mock Rules first
    const matchedRule = this.rules.find((r) => {
      if (!r.enabled) return false;
      if (r.method && r.method !== method) return false;
      
      // Support simple string pattern or regex-like matching
      try {
        const pattern = new RegExp(r.urlPattern);
        return pattern.test(url);
      } catch {
        return url.includes(r.urlPattern);
      }
    });

    if (matchedRule && matchedRule.responseBody !== undefined) {
      console.log(`[MockRouter] Rule hit: ${method} ${url}`);
      return route.fulfill({
        status: matchedRule.statusCode ?? 200,
        contentType: matchedRule.contentType ?? 'application/json',
        headers: matchedRule.responseHeaders,
        body: matchedRule.responseBody,
      });
    }

    // 2. Fall back to HAR entries
    if (this.harEntries.length > 0) {
      const matchedHar = this.harEntries.find((entry) => {
        const entryUrl = entry.request.url;
        // Exact match or domain+path match
        return entryUrl === url || entryUrl.split('?')[0] === url.split('?')[0];
      });

      if (matchedHar) {
        console.log(`[MockRouter] HAR hit: ${method} ${url}`);
        return route.fulfill({
          status: matchedHar.response.status,
          contentType: matchedHar.response.content.mimeType,
          body: matchedHar.response.content.text,
        });
      }
    }

    // 3. No match — continue real request
    return route.continue();
  }
}
