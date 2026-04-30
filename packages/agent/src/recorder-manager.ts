import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import type { Recording, RecordingAction } from '@playwright-demo/shared';
import { captureFingerprint } from './fingerprint.js';

/** Injected JS: listens for DOM events and reports them via exposed function. */
const EVENT_COLLECTOR_JS = `
(() => {
  const debounceTimers = new Map();

  function getSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    if (el.getAttribute('data-testid')) return '[data-testid="' + el.getAttribute('data-testid') + '"]';
    if (el.getAttribute('data-test')) return '[data-test="' + el.getAttribute('data-test') + '"]';
    let sel = el.tagName.toLowerCase();
    for (const cls of Array.from(el.classList).slice(0, 3)) {
      sel += '.' + CSS.escape(cls);
    }
    return sel;
  }

  function reportEvent(type, el, extra) {
    if (!el || !el.tagName) return;

    // Debounce rapid input events (typing) — emit once after 300ms pause
    if (type === 'input') {
      const sel = getSelector(el);
      if (debounceTimers.has(sel)) clearTimeout(debounceTimers.get(sel));
      debounceTimers.set(sel, setTimeout(() => {
        debounceTimers.delete(sel);
        window.__actionRecorder__(type, getSelector(el));
      }, 300));
      return;
    }

    window.__actionRecorder__(type, getSelector(el), extra);
  }

  // Use capture phase so we see events before any page handlers stop propagation
  document.addEventListener('click', (e) => {
    const el = e.target;
    if (el && el.tagName) reportEvent('click', el);
  }, true);

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el && el.tagName) reportEvent('input', el);
  }, true);

  document.addEventListener('keydown', (e) => {
    // Only report special keys, not regular typing
    const specialKeys = ['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Delete'];
    if (specialKeys.includes(e.key)) {
      const el = e.target;
      if (el && el.tagName) reportEvent('keydown', el, e.key);
    }
  }, true);

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el && el.tagName) reportEvent('change', el);
  }, true);

  // Detect check/uncheck via focusout on checkboxes/radios (value changed while focused)
  document.addEventListener('focusout', (e) => {
    const el = e.target;
    if (el && el.tagName && (el.type === 'checkbox' || el.type === 'radio')) {
      reportEvent(el.checked ? 'check' : 'uncheck', el);
    }
  }, true);

  document.addEventListener('submit', (e) => {
    const el = e.target;
    if (el && el.tagName === 'FORM') reportEvent('submit', el);
  }, true);
})();
`;

export class RecorderManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private actions: Recording['actions'] = [];
  private onActionCallback: ((action: RecordingAction) => void) | null = null;

  /** Register a callback that fires for every recorded action in real time. */
  onAction(callback: (action: RecordingAction) => void): void {
    this.onActionCallback = callback;
  }

  async startRecording(targetUrl: string): Promise<void> {
    this.browser = await chromium.launch({ headless: false });
    try {
      this.context = await this.browser.newContext({
        recordHar: { path: this.getHarPath() },
      });
      this.actions = [];

      const page = await this.context.newPage();

      // 1. Expose bridge function BEFORE navigation (page JS -> Node)
      await page.exposeFunction(
        '__actionRecorder__',
        async (eventType: string, selector: string, extra?: string) => {
          this.handlePageEvent(page, eventType, selector, extra).catch((err) => {
            console.warn('Error handling page event:', err);
          });
        },
      );

      // 2. Inject event collector JS BEFORE navigation (persists across navigations)
      await page.addInitScript(EVENT_COLLECTOR_JS);

      // 3. Setup navigation tracking BEFORE navigation
      page.on('framenavigated', async (frame) => {
        if (frame === page.mainFrame()) {
          this.handlePageEvent(page, 'navigate', frame.url()).catch(() => {});
        }
      });

      // 4. Navigate to target with error handling
      await page.goto(targetUrl, { timeout: 30000, waitUntil: 'domcontentloaded' }).catch(() => {
        console.warn('Initial navigation may have partially failed, continuing anyway');
      });

      console.log(`Recording started on: ${page.url()}`);
    } catch (err) {
      await this.browser?.close();
      this.browser = null;
      throw err;
    }
  }

  /** Process a single page event: capture fingerprint, build action, store + notify. */
  private async handlePageEvent(
    page: Page,
    eventType: string,
    selector: string,
    extra?: string,
  ): Promise<void> {
    const url = page.url();
    const title = await page.title();
    const ts = Date.now();

    // Navigate events use URL as selector (not a CSS selector) — skip fingerprint
    let fingerprint: Awaited<ReturnType<typeof captureFingerprint>> = null;
    if (eventType === 'navigate') {
      fingerprint = {
        dataTestId: null, dataTest: null, role: null, accessibleName: null,
        textContent: null, placeholder: null, id: null, tagName: 'html',
        labelText: null, name: null, inputType: null, classes: [],
        parentPath: ['html'], nearbyText: [], boundingBox: null,
        isVisible: true,
      };
    } else if (selector) {
      // Validate selector is a valid CSS selector before querying
      const looksLikeCssSelector = selector.startsWith('#') || selector.startsWith('.') || selector.startsWith('[') || /^[a-z]/i.test(selector);
      fingerprint = looksLikeCssSelector ? await captureFingerprint(page, selector) : null;
    }
    if (!fingerprint) return;

    let action: RecordingAction | null = null;

    switch (eventType) {
      case 'click': {
        action = {
          name: 'click',
          selector,
          button: 'left',
          modifiers: 0,
          clickCount: 1,
          signals: [],
          elementInfo: fingerprint,
          pageContext: { url, title },
          timestamp: ts,
        };
        break;
      }

      case 'input': {
        const inputEl = selector ? await page.$(selector) : null;
        const value = inputEl
          ? await inputEl.evaluate((el) => (el as HTMLInputElement).value || '')
          : '';
        action = {
          name: 'fill',
          selector,
          value,
          signals: [],
          elementInfo: fingerprint,
          pageContext: { url, title },
          timestamp: ts,
        };
        break;
      }

      case 'keydown': {
        action = {
          name: 'press',
          selector,
          key: extra || 'Enter',
          modifiers: 0,
          signals: [],
          elementInfo: fingerprint,
          pageContext: { url, title },
          timestamp: ts,
        };
        break;
      }

      case 'change': {
        const inputEl = selector ? await page.$(selector) : null;
        const options = inputEl
          ? await inputEl.evaluate((el) => {
              const select = el as HTMLSelectElement;
              if (!select.selectedOptions) return [];
              return Array.from(select.selectedOptions).map((o) => o.value);
            })
          : [];
        action = {
          name: 'select',
          selector,
          options,
          signals: [],
          elementInfo: fingerprint,
          pageContext: { url, title },
          timestamp: ts,
        };
        break;
      }

      case 'check': {
        action = {
          name: 'check',
          selector,
          signals: [],
          elementInfo: fingerprint,
          pageContext: { url, title },
          timestamp: ts,
        };
        break;
      }

      case 'uncheck': {
        action = {
          name: 'uncheck',
          selector,
          signals: [],
          elementInfo: fingerprint,
          pageContext: { url, title },
          timestamp: ts,
        };
        break;
      }

      case 'submit': {
        // Form submit: treat as a click on the submit button/form itself
        action = {
          name: 'click',
          selector,
          button: 'left',
          modifiers: 0,
          clickCount: 1,
          signals: [],
          elementInfo: fingerprint,
          pageContext: { url, title },
          timestamp: ts,
        };
        break;
      }

      case 'navigate': {
        action = {
          name: 'navigate',
          url: selector, // selector carries the URL for navigate events
          signals: [],
          elementInfo: fingerprint ?? {
            dataTestId: null,
            dataTest: null,
            role: null,
            accessibleName: null,
            textContent: null,
            placeholder: null,
            id: null,
            tagName: 'html',
            labelText: null,
            name: null,
            inputType: null,
            classes: [],
            parentPath: ['html'],
            nearbyText: [],
            boundingBox: null,
            isVisible: true,
          },
          pageContext: { url, title },
          timestamp: ts,
        };
        break;
      }
    }

    if (action) {
      this.actions.push(action);
      if (this.onActionCallback) {
        this.onActionCallback(action);
      }
    }
  }

  async stopRecording(): Promise<{ actions: Recording['actions']; harPath: string }> {
    const harPath = this.getHarPath();
    await this.context?.close();
    await this.browser?.close();
    this.browser = null;
    this.context = null;
    return { actions: this.actions, harPath };
  }

  private getHarPath(): string {
    return `${process.env.STORAGE_PATH || './storage'}/temp-recording.har`;
  }

  getActions(): Recording['actions'] {
    return this.actions;
  }
}
