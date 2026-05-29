import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockRouter } from '../mock-router';

// Mock fs
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
}));

import { readFileSync, existsSync } from 'node:fs';

describe('MockRouter', () => {
  const mockRoute = {
    request: () => ({
      url: () => 'https://api.example.com/data',
      method: () => 'GET',
    }),
    continue: vi.fn(),
    fulfill: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches a simple urlPattern rule', async () => {
    const rules = [{
      urlPattern: 'api.example.com/data',
      enabled: true,
      method: 'GET',
      responseBody: '{"ok": true}',
      statusCode: 200,
      contentType: 'application/json',
    }];
    const router = new MockRouter(rules);
    await router.handleRoute(mockRoute);

    expect(mockRoute.fulfill).toHaveBeenCalledWith(expect.objectContaining({
      status: 200,
      body: '{"ok": true}',
    }));
  });

  it('matches a regex urlPattern rule', async () => {
    const rules = [{
      urlPattern: 'api\\.example\\.com/.*',
      enabled: true,
      method: 'GET',
      responseBody: '{"regex": "hit"}',
      statusCode: 200,
      contentType: 'application/json',
    }];
    const router = new MockRouter(rules);
    await router.handleRoute(mockRoute);

    expect(mockRoute.fulfill).toHaveBeenCalledWith(expect.objectContaining({
      body: '{"regex": "hit"}',
    }));
  });

  it('skips disabled rules', async () => {
    const rules = [{
      urlPattern: 'api.example.com/data',
      enabled: false,
      responseBody: '{"ok": true}',
      statusCode: 200,
      contentType: 'application/json',
    }];
    const router = new MockRouter(rules);
    await router.handleRoute(mockRoute);

    expect(mockRoute.continue).toHaveBeenCalled();
    expect(mockRoute.fulfill).not.toHaveBeenCalled();
  });

  it('falls back to real request if no match', async () => {
    const router = new MockRouter([]);
    await router.handleRoute(mockRoute);

    expect(mockRoute.continue).toHaveBeenCalled();
  });
});
