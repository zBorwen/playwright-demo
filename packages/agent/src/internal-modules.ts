import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const PLAYWRIGHT_CORE_DIR = path.dirname(
  require.resolve('playwright-core/package.json'),
);

const SERVER_DIR = path.join(PLAYWRIGHT_CORE_DIR, 'lib', 'server');

/**
 * Load internal modules from playwright-core's server-side code.
 * These are not public APIs but provide the Recorder event stream we need.
 */
export function loadInternalModules() {
  const { Recorder, RecorderEvent } = require(path.join(SERVER_DIR, 'recorder.js'));
  const { ProgrammaticRecorderApp } = require(path.join(SERVER_DIR, 'recorder', 'recorderApp.js'));
  const { languageSet } = require(path.join(SERVER_DIR, 'codegen', 'languages.js'));
  const { generateCode } = require(path.join(SERVER_DIR, 'codegen', 'language.js'));
  const { collapseActions, buildFullSelector, shouldMergeAction } = require(
    path.join(SERVER_DIR, 'recorder', 'recorderUtils.js'),
  );

  return {
    Recorder,
    RecorderEvent,
    ProgrammaticRecorderApp,
    languageSet,
    generateCode,
    collapseActions,
    buildFullSelector,
    shouldMergeAction,
  };
}
