import type { Page } from 'playwright-core';

export interface ElementFingerprint {
  dataTestId: string | null;
  dataTest: string | null;
  role: string | null;
  accessibleName: string | null;
  textContent: string | null;
  placeholder: string | null;
  id: string | null;
  tagName: string;
  labelText: string | null;
  name: string | null;
  inputType: string | null;
  classes: string[];
  parentPath: string[];
  nearbyText: string[];
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  isVisible: boolean;
}

export const FINGERPRINT_JS = `
(() => {
  const el = __TARGET_ELEMENT__;

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
    const texts = [];
    const parent = element.parentElement;
    if (!parent) return texts;
    const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (node.parentElement === element) return NodeFilter.FILTER_REJECT;
        const text = node.textContent?.trim();
        return text && text.length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    let node;
    while ((node = walker.nextNode()) && texts.length < 5) {
      texts.push(node.textContent.trim().slice(0, 80));
    }
    return texts;
  }

  const rect = el.getBoundingClientRect();
  const bb = rect.width > 0 && rect.height > 0
    ? { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
    : null;

  return JSON.stringify({
    dataTestId: el.getAttribute('data-testid'),
    dataTest: el.getAttribute('data-test'),
    role: el.getAttribute('role'),
    accessibleName: el.getAttribute('aria-label'),
    textContent: (el.textContent || '').trim().slice(0, 100) || null,
    placeholder: el.getAttribute('placeholder'),
    id: el.id || null,
    tagName: el.tagName.toLowerCase(),
    labelText: null,
    name: el.getAttribute('name'),
    inputType: el.getAttribute('type'),
    classes: Array.from(el.classList),
    parentPath: getParentPath(el),
    nearbyText: getNearbyText(el),
    boundingBox: bb,
    isVisible: el.offsetParent !== null,
  });
})()
`;

export async function captureFingerprint(page: Page, selector: string): Promise<ElementFingerprint | null> {
  try {
    const element = await page.$(selector);
    if (!element) return null;

    const evalScript = FINGERPRINT_JS.replace('__TARGET_ELEMENT__', 'this');
    const result = await element.evaluate(evalScript);

    if (typeof result !== 'string') {
      console.warn('Fingerprint evaluation returned non-string');
      return null;
    }
    return JSON.parse(result) as ElementFingerprint;
  } catch (err) {
    console.warn('Failed to capture fingerprint:', err);
    return null;
  }
}
