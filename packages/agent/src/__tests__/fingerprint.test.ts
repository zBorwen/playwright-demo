import { describe, it, expect } from 'vitest';
import { FINGERPRINT_JS } from '../fingerprint.js';

describe('Fingerprint script', () => {
  it('has valid JavaScript', () => {
    const script = FINGERPRINT_JS.replace('__TARGET_ELEMENT__', 'el');
    expect(() => new Function('el', script)).not.toThrow();
  });
});
