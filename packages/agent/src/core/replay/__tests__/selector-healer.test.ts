import { describe, it, expect } from 'vitest';
import { generateFallbackSelectors } from '../selector-healer';
import type { ElementInfo } from '@playwright-demo/shared';

describe('generateFallbackSelectors', () => {
  it('returns data-testid as first priority when available', () => {
    const elementInfo: ElementInfo = {
      dataTestId: 'submit-btn',
      dataTest: null,
      role: 'button',
      accessibleName: 'Submit',
      textContent: 'Submit',
      placeholder: null,
      id: 'form-submit',
      tagName: 'BUTTON',
      labelText: null,
      name: 'submit',
      inputType: null,
      classes: ['btn', 'btn-primary'],
      parentPath: ['form', 'div'],
      nearbyText: ['Cancel'],
      boundingBox: null,
      isVisible: true,
    };
    const strategies = generateFallbackSelectors(elementInfo);
    expect(strategies[0]).toEqual({ strategy: 'css', value: '[data-testid="submit-btn"]' });
  });

  it('generates role strategy when role and accessibleName available', () => {
    const elementInfo: ElementInfo = {
      dataTestId: null,
      dataTest: null,
      role: 'button',
      accessibleName: 'Submit',
      textContent: 'Submit',
      placeholder: null,
      id: null,
      tagName: 'BUTTON',
      labelText: null,
      name: null,
      inputType: null,
      classes: ['btn'],
      parentPath: ['div'],
      nearbyText: [],
      boundingBox: null,
      isVisible: true,
    };
    const strategies = generateFallbackSelectors(elementInfo);
    const roleStrategy = strategies.find((s) => s.strategy === 'role');
    expect(roleStrategy).toEqual({
      strategy: 'role',
      value: { role: 'button', name: 'Submit' },
    });
  });

  it('generates text strategy when textContent available', () => {
    const elementInfo: ElementInfo = {
      dataTestId: null,
      dataTest: null,
      role: null,
      accessibleName: null,
      textContent: 'Click me',
      placeholder: null,
      id: null,
      tagName: 'SPAN',
      labelText: null,
      name: null,
      inputType: null,
      classes: ['label'],
      parentPath: ['div'],
      nearbyText: [],
      boundingBox: null,
      isVisible: true,
    };
    const strategies = generateFallbackSelectors(elementInfo);
    const textStrategy = strategies.find((s) => s.strategy === 'text');
    expect(textStrategy?.value).toBe('Click me');
  });

  it('uses aria-label css selector when accessibleName exists without role', () => {
    const elementInfo: ElementInfo = {
      dataTestId: null,
      dataTest: null,
      role: null,
      accessibleName: 'Close dialog',
      textContent: null,
      placeholder: null,
      id: null,
      tagName: 'BUTTON',
      labelText: null,
      name: null,
      inputType: null,
      classes: [],
      parentPath: [],
      nearbyText: [],
      boundingBox: null,
      isVisible: true,
    };
    const strategies = generateFallbackSelectors(elementInfo);
    expect(strategies.some((s) => s.strategy === 'css' && s.value.includes('aria-label'))).toBe(true);
  });

  it('uses id css selector as fallback', () => {
    const elementInfo: ElementInfo = {
      dataTestId: null,
      dataTest: null,
      role: null,
      accessibleName: null,
      textContent: null,
      placeholder: null,
      id: 'unique-id',
      tagName: 'DIV',
      labelText: null,
      name: null,
      inputType: null,
      classes: [],
      parentPath: [],
      nearbyText: [],
      boundingBox: null,
      isVisible: true,
    };
    const strategies = generateFallbackSelectors(elementInfo);
    expect(strategies).toContainEqual({ strategy: 'css', value: '#unique-id' });
  });

  it('includes name attribute selector for INPUT elements', () => {
    const elementInfo: ElementInfo = {
      dataTestId: null,
      dataTest: null,
      role: null,
      accessibleName: null,
      textContent: null,
      placeholder: 'Enter email',
      id: null,
      tagName: 'INPUT',
      labelText: null,
      name: 'email',
      inputType: 'text',
      classes: [],
      parentPath: [],
      nearbyText: [],
      boundingBox: null,
      isVisible: true,
    };
    const strategies = generateFallbackSelectors(elementInfo);
    expect(strategies).toContainEqual({ strategy: 'css', value: 'input[name="email"]' });
    expect(strategies).toContainEqual({ strategy: 'css', value: 'input[placeholder="Enter email"]' });
  });

  it('returns empty array when no usable selectors exist', () => {
    const elementInfo: ElementInfo = {
      dataTestId: null,
      dataTest: null,
      role: null,
      accessibleName: null,
      textContent: null,
      placeholder: null,
      id: null,
      tagName: 'DIV',
      labelText: null,
      name: null,
      inputType: null,
      classes: [],
      parentPath: [],
      nearbyText: [],
      boundingBox: null,
      isVisible: true,
    };
    const strategies = generateFallbackSelectors(elementInfo);
    expect(strategies).toEqual([]);
  });

  it('returns strategies in correct priority order', () => {
    const elementInfo: ElementInfo = {
      dataTestId: 'login-submit',
      dataTest: null,
      role: 'button',
      accessibleName: 'Sign In',
      textContent: 'Login',
      placeholder: null,
      id: 'submit-id',
      tagName: 'BUTTON',
      labelText: null,
      name: null,
      inputType: null,
      classes: ['btn'],
      parentPath: ['form'],
      nearbyText: [],
      boundingBox: null,
      isVisible: true,
    };
    const strategies = generateFallbackSelectors(elementInfo);
    // Order: data-testid > role+name > text > id
    expect(strategies[0].strategy).toBe('css'); // data-testid
    expect(strategies[0].value).toBe('[data-testid="login-submit"]');
    expect(strategies[1].strategy).toBe('role'); // role + accessibleName
    expect(strategies[2].strategy).toBe('text'); // textContent
    expect(strategies.find((s) => s.value === '#submit-id')).toBeTruthy(); // id
  });
});
