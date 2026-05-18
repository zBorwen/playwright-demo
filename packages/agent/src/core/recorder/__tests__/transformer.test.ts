import { describe, it, expect, vi } from 'vitest';
import { transformRecorderAction } from '../transformer';

describe('transformRecorderAction', () => {
  const mockPage = {
    url: () => 'https://example.com',
  } as any;

  const mockElementInfo = { tagName: 'BUTTON' } as any;
  const ts = Date.now();

  it('transforms a click action', () => {
    const actionData = { name: 'click', selector: 'button#login' };
    const result = transformRecorderAction(actionData as any, mockPage, mockElementInfo, ts);
    
    expect(result).toMatchObject({
      name: 'click',
      selector: 'button#login',
      button: 'left',
      timestamp: ts,
    });
  });

  it('transforms a fill action', () => {
    const actionData = { name: 'fill', selector: 'input#user', text: 'admin' };
    const result = transformRecorderAction(actionData as any, mockPage, mockElementInfo, ts);
    
    expect(result).toMatchObject({
      name: 'fill',
      selector: 'input#user',
      value: 'admin',
    });
  });

  it('transforms a navigate action', () => {
    const actionData = { name: 'navigate', url: 'https://google.com' };
    const result = transformRecorderAction(actionData as any, mockPage, mockElementInfo, ts);
    
    expect(result).toMatchObject({
      name: 'navigate',
      url: 'https://google.com',
    });
  });

  it('handles unknown action names by returning null', () => {
    const actionData = { name: 'warp-drive', selector: '.ship' };
    const result = transformRecorderAction(actionData as any, mockPage, mockElementInfo, ts);
    expect(result).toBeNull();
  });
});
