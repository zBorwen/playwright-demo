import type { ElementInfo } from '@playwright-demo/shared';

export type FallbackStrategy =
  | { strategy: 'role'; value: { role: string; name?: string } }
  | { strategy: 'text'; value: string }
  | { strategy: 'css'; value: string };

/**
 * Generate ordered fallback strategies from an element's fingerprint.
 * Priority: data-testid > data-test > role+name > textContent > aria-label > #id > input[name] > input[placeholder]
 *
 * Caller (replay-engine) should iterate through strategies in order,
 * using the appropriate Playwright API based on the strategy type.
 */
export function generateFallbackSelectors(elementInfo: ElementInfo): FallbackStrategy[] {
  const strategies: FallbackStrategy[] = [];

  if (elementInfo.dataTestId) {
    strategies.push({ strategy: 'css', value: `[data-testid="${esc(elementInfo.dataTestId)}"]` });
  }

  if (elementInfo.dataTest) {
    strategies.push({ strategy: 'css', value: `[data-test="${esc(elementInfo.dataTest)}"]` });
  }

  if (elementInfo.role && elementInfo.accessibleName) {
    strategies.push({ strategy: 'role', value: { role: elementInfo.role, name: elementInfo.accessibleName } });
  } else if (elementInfo.role) {
    strategies.push({ strategy: 'role', value: { role: elementInfo.role } });
  }

  if (elementInfo.textContent && elementInfo.textContent.trim().length > 0) {
    strategies.push({ strategy: 'text', value: elementInfo.textContent.trim() });
  }

  if (elementInfo.accessibleName && !elementInfo.role) {
    strategies.push({ strategy: 'css', value: `[aria-label="${esc(elementInfo.accessibleName)}"]` });
  }

  if (elementInfo.id) {
    strategies.push({ strategy: 'css', value: `#${escCssId(elementInfo.id)}` });
  }

  if (elementInfo.name && elementInfo.tagName === 'INPUT') {
    strategies.push({ strategy: 'css', value: `input[name="${esc(elementInfo.name)}"]` });
  }

  if (elementInfo.placeholder) {
    strategies.push({ strategy: 'css', value: `input[placeholder="${esc(elementInfo.placeholder)}"]` });
  }

  return strategies;
}

function esc(value: string): string {
  return value.replace(/"/g, '\\"');
}

function escCssId(value: string): string {
  // CSS.escape is not available in Node.js. Escape common special chars.
  return value.replace(/([^\w-])/g, '\\$1');
}
