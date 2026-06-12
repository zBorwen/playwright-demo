import { describe, it, expect } from 'vitest';
import { generateFallbackSelectors } from '../selector-healer';
import type { ElementInfo } from '@playwright-demo/shared';

describe('replay healing integration', () => {
  it('generates selectors that differ from fragile CSS selector', () => {
    const elementInfo: ElementInfo = {
      dataTestId: 'login-submit',
      dataTest: null,
      role: 'button',
      accessibleName: 'Sign In',
      textContent: 'Login',
      placeholder: null,
      id: null,
      tagName: 'BUTTON',
      labelText: null,
      name: 'login',
      inputType: null,
      classes: ['btn', 'btn-primary'],
      parentPath: ['form', 'div', 'main'],
      nearbyText: ['Forgot password?'],
      boundingBox: { x: 100, y: 200, width: 120, height: 40 },
      isVisible: true,
    };

    const originalSelector = 'form > div > .btn.btn-primary';
    const fallbacks = generateFallbackSelectors(elementInfo);

    expect(fallbacks).not.toContainEqual({ strategy: 'css', value: originalSelector });
    expect(fallbacks[0]).toEqual({ strategy: 'css', value: '[data-testid="login-submit"]' });
  });
});
