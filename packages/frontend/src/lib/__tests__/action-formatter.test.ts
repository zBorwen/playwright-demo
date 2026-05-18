import { describe, it, expect } from 'vitest';
import { formatActionDetail, isPasswordField } from '../action-formatter';

describe('action-formatter', () => {
  const baseFields: any = {
    elementInfo: {
      tagName: 'INPUT',
      classes: [],
      parentPath: [],
      nearbyText: [],
      boundingBox: null,
      isVisible: true,
    },
    pageContext: { url: 'https://example.com' },
    timestamp: Date.now(),
    signals: [],
  };

  describe('isPasswordField', () => {
    it('detects password by inputType', () => {
      const action = {
        ...baseFields,
        name: 'fill',
        elementInfo: { ...baseFields.elementInfo, inputType: 'password' },
      };
      expect(isPasswordField(action)).toBe(true);
    });

    it('detects password by selector keyword', () => {
      const action = {
        ...baseFields,
        name: 'fill',
        selector: 'input#login-password',
      };
      expect(isPasswordField(action)).toBe(true);
    });
  });

  describe('formatActionDetail', () => {
    it('formats click with human-readable label from selector', () => {
      const action = {
        ...baseFields,
        name: 'click',
        selector: 'internal:role=button[name="登录"i]',
      };
      expect(formatActionDetail(action)).toBe('点击「登录」');
    });

    it('formats fill with value and label', () => {
      const action = {
        ...baseFields,
        name: 'fill',
        selector: 'internal:role=textbox[name="用户名"i]',
        value: 'admin',
      };
      expect(formatActionDetail(action)).toBe('在「用户名」输入「admin」');
    });

    it('masks value for password fields', () => {
      const action = {
        ...baseFields,
        name: 'fill',
        selector: 'input[name="password"]',
        value: 'secret123',
      };
      expect(formatActionDetail(action)).toBe('在「password」输入密码');
    });

    it('formats navigate with URL', () => {
      const action = {
        ...baseFields,
        name: 'navigate',
        url: 'https://playwright.dev/docs/intro',
      };
      expect(formatActionDetail(action)).toBe('打开 https://playwright.dev/docs/intro');
    });
  });
});
