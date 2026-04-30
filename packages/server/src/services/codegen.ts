import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const SERVER_DIR = path.join(
  path.dirname(require.resolve('playwright-core/package.json')),
  'lib',
  'server',
);

const { generateCode } = require(path.join(SERVER_DIR, 'codegen', 'language.js'));
const { JavaScriptLanguageGenerator } = require(path.join(SERVER_DIR, 'codegen', 'javascript.js'));

interface ActionInContext {
  frame: { pageGuid: string; pageAlias: string; framePath: string[] };
  action: { name: string; selector?: string; url?: string; signals: unknown[]; [key: string]: unknown };
  startTime: number;
  endTime: number;
}

// playwright-core expects pageGuid to look like a frame identifier
const PAGE_GUID = 'page-00000000000000000000000000000000';

/**
 * Convert our RecordingAction format to playwright-core's ActionInContext format.
 * playwright-core codegen uses `text` for fill values, `url` for navigate, etc.
 */
function toActionInContext(action: Record<string, unknown>): ActionInContext | null {
  const name = action.name as string;
  if (!name) return null;

  const selector = typeof action.selector === 'string' ? action.selector : undefined;

  // playwright-core codegen expects specific fields per action type.
  // Provide safe defaults for missing required fields so codegen never crashes.
  const convertedAction: ActionInContext['action'] = {
    name,
    selector: selector ?? 'locator', // fallback for selector-based actions
    signals: (action.signals as unknown[]) ?? [],
    // fill → text field; also keep value for assertValue
    text: typeof action.value === 'string' ? action.value : (typeof action.text === 'string' ? action.text : ''),
    url: typeof action.url === 'string' ? action.url : 'about:blank',
    key: typeof action.key === 'string' ? action.key : 'Enter',
    value: typeof action.value === 'string' ? action.value : '',
    options: Array.isArray(action.options) ? action.options : [''],
    button: typeof action.button === 'string' ? action.button : 'left',
    modifiers: typeof action.modifiers === 'number' ? action.modifiers : 0,
    clickCount: typeof action.clickCount === 'number' ? action.clickCount : 1,
    checked: typeof action.checked === 'boolean' ? action.checked : false,
    files: Array.isArray(action.files) && action.files.length > 0 ? action.files : ['file.txt'],
    substring: typeof action.substring === 'boolean' ? action.substring : false,
    ariaSnapshot: typeof action.ariaSnapshot === 'string' ? action.ariaSnapshot : '',
  };

  return {
    frame: { pageGuid: PAGE_GUID, pageAlias: 'page', framePath: [] },
    action: convertedAction,
    startTime: (action.timestamp as number) ?? Date.now(),
    endTime: (action.timestamp as number) ?? Date.now(),
  };
}

export function generateCodegen(actions: Record<string, unknown>[]): string {
  const generator = new JavaScriptLanguageGenerator(true); // playwright-test mode
  const converted = actions
    .map(toActionInContext)
    .filter((a): a is ActionInContext => a !== null);

  if (converted.length === 0) return '';

  const { text } = generateCode(converted, generator, {
    browserName: 'chromium',
    launchOptions: { headless: false },
    contextOptions: {},
    saveStorage: undefined,
  });

  return text;
}
