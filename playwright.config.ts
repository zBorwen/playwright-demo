import os from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

const runId = `${process.pid}`;
const issueDbPath = path.join(os.tmpdir(), `playwright-demo-issues-e2e-${runId}.sqlite`);
const outputDir = path.join(os.tmpdir(), `playwright-demo-results-${runId}`);

export default defineConfig({
  testDir: './tests',
  outputDir,
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel: 'chrome',
    headless: true,
  },
  webServer: [
    {
      command: `ISSUES_DB_PATH="${issueDbPath}" pnpm --filter server start`,
      port: 3000,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'pnpm --filter frontend dev --host 127.0.0.1',
      port: 5173,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
