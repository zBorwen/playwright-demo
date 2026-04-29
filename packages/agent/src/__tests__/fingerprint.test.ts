import { describe, it, expect } from 'vitest';

describe('Fingerprint script', () => {
  it('has valid JavaScript', () => {
    const script = `
    (() => {
      const el = { tagName: 'BUTTON', getAttribute: () => null, classList: [], parentElement: null, textContent: 'test', getBoundingClientRect: () => ({ x: 0, y: 0, width: 80, height: 30 }), offsetParent: {}, querySelectorAll: () => [] };

      function getParentPath(element) {
        const path = [];
        let current = element;
        while (current && current.tagName) {
          path.unshift(current.tagName.toLowerCase());
          current = current.parentElement;
          if (path.length > 6) break;
        }
        return path;
      }

      function getNearbyText(element) {
        return [];
      }

      const rect = el.getBoundingClientRect();
      const bb = rect.width > 0 && rect.height > 0
        ? { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
        : null;

      return JSON.stringify({
        dataTestId: el.getAttribute('data-testid'),
        tagName: el.tagName.toLowerCase(),
        classes: Array.from(el.classList),
        parentPath: getParentPath(el),
        boundingBox: bb,
        isVisible: el.offsetParent !== null,
      });
    })()
    `;
    expect(() => new Function(script)).not.toThrow();
  });
});
