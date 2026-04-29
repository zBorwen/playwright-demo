import { describe, it, expect } from 'vitest';
import {
  ElementInfoSchema,
  ClickActionSchema,
  FillActionSchema,
  RecordingSchema,
} from '../schema/actions.js';

describe('ElementInfoSchema', () => {
  it('accepts valid ElementInfo', () => {
    const validElementInfo = {
      dataTestId: 'submit-btn',
      dataTest: 'submit-btn',
      role: 'button',
      accessibleName: 'Submit',
      textContent: 'Submit',
      placeholder: null,
      id: 'form-submit',
      tagName: 'BUTTON',
      labelText: 'Submit Form',
      name: 'submit',
      inputType: null,
      classes: ['btn', 'btn-primary'],
      parentPath: ['form', 'div'],
      nearbyText: ['Cancel'],
      boundingBox: { x: 10, y: 20, width: 100, height: 40 },
      isVisible: true,
    };
    const result = ElementInfoSchema.safeParse(validElementInfo);
    expect(result.success).toBe(true);
  });

  it('rejects missing tagName', () => {
    const result = ElementInfoSchema.safeParse({
      dataTestId: 'btn',
      tagName: undefined,
    });
    expect(result.success).toBe(false);
  });
});

describe('ClickActionSchema', () => {
  it('applies default values', () => {
    const result = ClickActionSchema.safeParse({
      name: 'click',
      selector: '#submit',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.button).toBe('left');
      expect(result.data.modifiers).toBe(0);
      expect(result.data.clickCount).toBe(1);
      expect(result.data.signals).toEqual([]);
    }
  });
});

describe('FillActionSchema', () => {
  it('accepts valid fill action', () => {
    const result = FillActionSchema.safeParse({
      name: 'fill',
      selector: '#username',
      value: 'hello@example.com',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.signals).toEqual([]);
    }
  });
});

describe('RecordingSchema', () => {
  it('accepts valid recording with UUID and URL', () => {
    const result = RecordingSchema.safeParse({
      recordingId: '550e8400-e29b-41d4-a716-446655440000',
      targetUrl: 'https://example.com/login',
      title: 'Login flow',
      actions: [
        {
          name: 'navigate',
          url: 'https://example.com/login',
          elementInfo: {
            dataTestId: null,
            dataTest: null,
            role: null,
            accessibleName: null,
            textContent: null,
            placeholder: null,
            id: null,
            tagName: 'HTML',
            labelText: null,
            name: null,
            inputType: null,
            classes: [],
            parentPath: [],
            nearbyText: [],
            boundingBox: null,
            isVisible: true,
          },
          pageContext: { url: 'https://example.com/login' },
          timestamp: 1700000000000,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID recordingId', () => {
    const result = RecordingSchema.safeParse({
      recordingId: 'not-a-uuid',
      targetUrl: 'https://example.com',
      title: 'Test',
      actions: [],
    });
    expect(result.success).toBe(false);
  });
});
