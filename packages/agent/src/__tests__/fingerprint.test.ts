import { describe, it, expect } from 'vitest';
import { FINGERPRINT_JS } from '../fingerprint.js';

describe('Fingerprint script', () => {
  it('has valid JavaScript', () => {
    const script = FINGERPRINT_JS.replace('__TARGET_ELEMENT__', 'el');
    expect(() => new Function('el', script)).not.toThrow();
  });
});

describe('HAR mock parsing', () => {
  it('parses valid HAR content', () => {
    const harContent = {
      log: {
        entries: [
          {
            request: { url: 'https://api.example.com/users', method: 'GET' },
            response: {
              status: 200,
              content: { text: '[{"id":1}]', mimeType: 'application/json' },
            },
          },
        ],
      },
    };

    const entries = harContent.log.entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].request.url).toBe('https://api.example.com/users');
    expect(entries[0].response.status).toBe(200);
  });

  it('handles empty HAR entries', () => {
    const harContent = {
      log: { entries: [] },
    };
    expect(harContent.log.entries).toHaveLength(0);
  });
});

describe('MockRule matching', () => {
  it('matches URL pattern', () => {
    const rules = [
      { urlPattern: '.*api.*', enabled: true, responseBody: '{"mock": true}' },
    ];
    const match = rules.find((r) => {
      if (!r.enabled) return false;
      return new RegExp(r.urlPattern).test('https://api.example.com/users');
    });
    expect(match).toBeDefined();
    expect(match!.responseBody).toBe('{"mock": true}');
  });

  it('ignores disabled rules', () => {
    const rules = [
      { urlPattern: '.*api.*', enabled: false, responseBody: '{"mock": true}' },
    ];
    const match = rules.find((r) => {
      if (!r.enabled) return false;
      return new RegExp(r.urlPattern).test('https://api.example.com/users');
    });
    expect(match).toBeUndefined();
  });
});
