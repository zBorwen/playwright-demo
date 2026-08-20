import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    channel: 'chrome',
    headless: true,
  },
  webServer: [
    {
      command: 'ISSUES_DB_PATH=./data/issues-e2e.sqlite pnpm --filter server start',
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
