import { describe, it, expect } from 'vitest';
import { app } from '../app.js';

describe('Server integration', () => {
  it('health endpoint returns ok', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });
});
