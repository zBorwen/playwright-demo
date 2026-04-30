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

/**
 * Convert our RecordingAction format to playwright-core's ActionInContext format.
 */
function toActionInContext(action: Record<string, unknown>): ActionInContext {
  return {
    frame: { pageGuid: 'page', pageAlias: 'page', framePath: [] },
    action: {
      name: action.name as string,
      selector: action.selector as string | undefined,
      url: action.url as string | undefined,
      signals: (action.signals as unknown[]) ?? [],
      text: action.value as string | undefined ?? action.text as string | undefined,
      key: action.key as string | undefined,
      value: action.value as string | undefined,
      options: action.options as string[] | undefined,
      button: action.button as string | undefined,
      modifiers: action.modifiers as number | undefined,
      clickCount: action.clickCount as number | undefined,
      checked: action.checked as boolean | undefined,
    },
    startTime: (action.timestamp as number) ?? Date.now(),
    endTime: (action.timestamp as number) ?? Date.now(),
  };
}

export function generateCodegen(actions: Record<string, unknown>[]): string {
  const generator = new JavaScriptLanguageGenerator(true); // playwright-test mode
  const converted = actions.map(toActionInContext);

  const { text } = generateCode(converted, generator, {
    browserName: 'chromium',
    launchOptions: { headless: false },
    contextOptions: {},
    saveStorage: undefined,
  });

  return text;
}
