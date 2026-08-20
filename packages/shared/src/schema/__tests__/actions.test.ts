import { describe, it, expect } from 'vitest';
import { RecordingAction, RecordingActionSchema } from '../actions.js';

describe('RecordingActionSchema', () => {
  const baseFields = {
    signals: [],
    elementInfo: {
      dataTestId: null, dataTest: null, role: null, accessibleName: null,
      textContent: null, placeholder: null, id: null, tagName: 'BUTTON',
      labelText: null, name: null, inputType: null, classes: [],
      parentPath: [], nearbyText: [], boundingBox: null, isVisible: true,
    },
    pageContext: { url: 'https://example.com' },
    timestamp: Date.now(),
  };

  it('parses click with default values', () => {
    const result = RecordingActionSchema.safeParse({
      name: 'click',
      selector: '#submit',
      ...baseFields,
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.name === 'click') {
      expect(result.data.button).toBe('left');
      expect(result.data.modifiers).toBe(0);
      expect(result.data.clickCount).toBe(1);
    }
  });

  it('parses fill with required fields', () => {
    const result = RecordingActionSchema.safeParse({
      name: 'fill',
      selector: '#username',
      value: 'hello@example.com',
      ...baseFields,
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.name === 'fill') {
      expect(result.data.value).toBe('hello@example.com');
    }
  });

  it('rejects unknown action name', () => {
    const result = RecordingActionSchema.safeParse({
      name: 'unknown',
      selector: '#btn',
      ...baseFields,
    });
    expect(result.success).toBe(false);
  });
});

describe('RecordingAction type', () => {
  it('accepts valid RecordingAction shape via type check', () => {
    const action: RecordingAction = {
      name: 'click',
      selector: '#btn',
      button: 'left',
      modifiers: 0,
      clickCount: 1,
      signals: [],
      elementInfo: {
        dataTestId: null,
        dataTest: null,
        role: 'button',
        accessibleName: 'Click',
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
      },
      pageContext: { url: 'https://example.com' },
      timestamp: 1700000000000,
    };
    expect(action.name).toBe('click');
  });
});
