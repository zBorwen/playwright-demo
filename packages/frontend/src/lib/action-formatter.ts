import type { RecordingAction } from '@playwright-demo/shared';

export const ACTION_ICONS: Record<string, string> = {
  click: '👆',
  fill: '⌨️',
  navigate: '🔗',
  hover: '👆',
  press: '⌨️',
  select: '📋',
  check: '☑️',
  uncheck: '☐',
  assertVisible: '👁️',
  assertText: '📝',
  assertChecked: '☑️',
  assertValue: '📊',
  setInputFiles: '📁',
};

function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len) + '...' : s;
}

export function formatActionDetail(action: RecordingAction): string {
  const parts: string[] = [];

  if ('selector' in action && action.selector) {
    parts.push(action.selector);
  }

  switch (action.name) {
    case 'fill':
      if (action.value) parts.push(`"${truncate(action.value, 30)}"`);
      break;
    case 'press':
      if (action.key) parts.push(`key: ${action.key}`);
      break;
    case 'select':
      if (action.options?.length) parts.push(`options: ${action.options.join(', ')}`);
      break;
    case 'click':
      if (action.button && action.button !== 'left') parts.push(`${action.button} click`);
      if (action.modifiers) parts.push(`modifiers: ${action.modifiers}`);
      break;
    case 'navigate':
      if (action.url) parts.push(action.url);
      break;
    case 'assertText':
      if (action.text) parts.push(`text: "${truncate(action.text, 30)}"`);
      break;
    case 'assertChecked':
      parts.push(`checked: ${action.checked}`);
      break;
    case 'assertValue':
      if (action.value) parts.push(`value: "${truncate(action.value, 30)}"`);
      break;
    case 'setInputFiles':
      if (action.files?.length) parts.push(`files: ${action.files.join(', ')}`);
      break;
  }

  if (action.elementInfo?.role) {
    parts.unshift(`[${action.elementInfo.role}]`);
  }

  return parts.join(' ');
}
