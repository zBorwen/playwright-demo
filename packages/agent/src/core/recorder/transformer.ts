import type { RecordingAction, ElementInfo } from '@playwright-demo/shared';
import type { Page } from 'playwright-core';
import type { RecorderActionData } from '../../types/playwright-internal';

interface BaseRecordingFields {
  signals: unknown[];
  elementInfo: ElementInfo;
  pageContext: { url: string; title: string };
  timestamp: number;
}

export function transformRecorderAction(
  actionData: RecorderActionData['action'],
  page: Page,
  elementInfo: ElementInfo,
  timestamp: number
): RecordingAction | null {
  const { name: actionName, selector, url, value, text, key, options, checked, signals } = actionData;

  const baseFields: BaseRecordingFields = {
    signals: signals ?? [],
    elementInfo,
    pageContext: {
      url: page.url(),
      title: '' // Will be updated by caller
    },
    timestamp,
  };

  switch (actionName) {
    case 'click':
      return {
        name: 'click',
        selector: selector || '',
        button: actionData.button || 'left',
        modifiers: actionData.modifiers || 0,
        clickCount: actionData.clickCount || 1,
        ...baseFields,
      } as RecordingAction;

    case 'fill':
      return {
        name: 'fill',
        selector: selector || '',
        value: value ?? text ?? '',
        ...baseFields,
      } as RecordingAction;

    case 'press':
      return {
        name: 'press',
        selector: selector || '',
        key: key ?? 'Enter',
        modifiers: actionData.modifiers || 0,
        ...baseFields,
      } as RecordingAction;

    case 'select':
      return {
        name: 'select',
        selector: selector || '',
        options: options ?? [],
        ...baseFields,
      } as RecordingAction;

    case 'check':
      return {
        name: 'check',
        selector: selector || '',
        ...baseFields,
      } as RecordingAction;

    case 'uncheck':
      return {
        name: 'uncheck',
        selector: selector || '',
        ...baseFields,
      } as RecordingAction;

    case 'navigate':
      return {
        name: 'navigate',
        url: url || page.url(),
        ...baseFields,
      } as RecordingAction;

    case 'assertText':
      return {
        name: 'assertText',
        selector: selector || '',
        text: text ?? '',
        substring: true,
        ...baseFields,
      } as RecordingAction;

    case 'assertVisible':
      return {
        name: 'assertVisible',
        selector: selector || '',
        ...baseFields,
      } as RecordingAction;

    case 'assertChecked':
      return {
        name: 'assertChecked',
        selector: selector || '',
        checked: checked === true,
        ...baseFields,
      } as RecordingAction;

    case 'assertValue':
      return {
        name: 'assertValue',
        selector: selector || '',
        value: value ?? '',
        ...baseFields,
      } as RecordingAction;

    case 'setInputFiles':
      return {
        name: 'setInputFiles',
        selector: selector || '',
        files: (options as string[]) ?? [],
        ...baseFields,
      } as RecordingAction;

    default:
      return null;
  }
}
