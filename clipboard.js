/**
 * Playwright 跨标签页书签录制器 - 方案1：系统剪贴板 + window.name 版
 * 适用：同源/跨域跳转、支持用户手动按 "+" 号新建空白标签页接力录制
 */
(function () {
  if (window.__PW_REC_CLIP__) {
    alert('Playwright 剪贴板版录制器已在当前页面运行！');
    return;
  }
  window.__PW_REC_CLIP__ = true;

  const CLIP_PREFIX = '__PW_CLIP_SYNC_V2__:';
  const WNAME_PREFIX = '__PW_WNAME_V2__:';

  let state = {
    sessionId: 'clip_' + Date.now(),
    updatedAt: Date.now(),
    pageCounter: 0,
    lastPopupSource: null,
    pages: {},
    steps: []
  };
  let pageId = null;

  const encode = (o) => btoa(encodeURIComponent(JSON.stringify(o)));
  const decode = (s) => JSON.parse(decodeURIComponent(atob(s)));

  // 1. 实时写入当前 Tab 的 window.name（保证同 Tab 内发生 location.href / 刷新时不丢状态、不乱 pageId）
  function saveToWindowName() {
    try {
      state.updatedAt = Date.now();
      window.name = WNAME_PREFIX + encode({ pageId, state });
    } catch (e) {
      console.warn('[PW-Clip] window.name 写入失败:', e);
    }
  }

  // 2. 写入系统剪贴板（在 click / change 事件触发时拥有天然 User Activation，静默写入）
  async function saveToClipboard() {
    saveToWindowName();
    try {
      await navigator.clipboard.writeText(CLIP_PREFIX + JSON.stringify(state));
    } catch (e) {
      console.warn('[PW-Clip] 剪贴板写入需在用户点击上下文触发:', e);
    }
  }

  // 3. 启动或手动点击时恢复状态（比对 window.name 与剪贴板的时间戳，采用最新数据）
  async function restoreState(forceClipboard = false) {
    let wnameData = null;
    if (!forceClipboard && window.name && window.name.startsWith(WNAME_PREFIX)) {
      try {
        wnameData = decode(window.name.replace(WNAME_PREFIX, ''));
      } catch (e) {}
    }

    let clipState = null;
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.startsWith(CLIP_PREFIX)) {
        clipState = JSON.parse(text.replace(CLIP_PREFIX, ''));
      }
    } catch (e) {
      // 首次在新域名下自动读取可能受限，用户可点击面板上的【接力上一Tab】按钮触发读取
    }

    if (clipState && (!wnameData || clipState.updatedAt >= wnameData.state.updatedAt)) {
      state = clipState;
      // 如果当前 Tab 之前已经分配过 pageId（例如从 page1 切回 page），保留它原本的身份
      if (wnameData && wnameData.pageId && state.pages[wnameData.pageId]) {
        pageId = wnameData.pageId;
      }
    } else if (wnameData) {
      state = wnameData.state;
      pageId = wnameData.pageId;
    }

    resolvePageIdentity();
    saveToWindowName();
    updateUI();
  }

  // 4. 自动识别并分配 page / page1 / page2
  function resolvePageIdentity() {
    if (pageId && state.pages[pageId]) {
      if (state.pages[pageId].url !== location.href) {
        state.pages[pageId].url = location.href;
      }
      return;
    }

    if (Object.keys(state.pages).length === 0) {
      pageId = 'page';
      state.pageCounter = 0;
      state.pages['page'] = { pageId: 'page', opener: null, url: location.href };
      state.steps.push({ pageId: 'page', action: 'goto', url: location.href, ts: Date.now() });
    } else {
      state.pageCounter += 1;
      pageId = 'page' + state.pageCounter;
      const opener = state.lastPopupSource || 'page';
      state.pages[pageId] = { pageId, opener, url: location.href };
      state.steps.push({ pageId, openerPageId: opener, action: 'newPage', url: location.href, ts: Date.now() });
      state.lastPopupSource = null;
    }
  }

  // 5. 跳转与卸载拦截（标记新窗口触发源 + 确保卸载前刷入 window.name）
  const rawOpen = window.open;
  window.open = function (url, target, features) {
    state.lastPopupSource = pageId;
    saveToWindowName();
    return rawOpen.call(window, url, target, features);
  };

  window.addEventListener('beforeunload', saveToWindowName, true);
  window.addEventListener('pagehide', saveToWindowName, true);

  document.addEventListener('click', async (e) => {
    if (panel.contains(e.target)) return;
    const link = e.target.closest('a[href]');
    if (link && (link.target === '_blank' || e.ctrlKey || e.metaKey || e.button === 1)) {
      state.lastPopupSource = pageId;
    }

    // ⬇️ 这里可替换为你自己的录制 Schema 结构（保留 pageId 即可）
    state.steps.push({
      pageId,
      action: 'click',
      selector: getSelector(e.target),
      url: location.href,
      ts: Date.now()
    });

    updateUI();
    await saveToClipboard();
  }, true);

  document.addEventListener('change', async (e) => {
    if (panel.contains(e.target)) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
      // ⬇️ 这里可替换为你自己的录制 Schema 结构（保留 pageId 即可）
      state.steps.push({
        pageId,
        action: 'fill',
        selector: getSelector(e.target),
        value: e.target.value,
        url: location.href,
        ts: Date.now()
      });

      updateUI();
      await saveToClipboard();
    }
  }, true);

  // 6. 选择器生成与 Playwright 代码编译
  function getSelector(el) {
    if (el.getAttribute('data-testid')) return `[data-testid="${el.getAttribute('data-testid')}"]`;
    if (el.id) return `#${CSS.escape(el.id)}`;
    if (el.name) return `${el.tagName.toLowerCase()}[name="${el.name}"]`;
    if (el.placeholder) return `[placeholder="${el.placeholder}"]`;
    const txt = (el.innerText || '').trim();
    if (txt && txt.length <= 20 && ['BUTTON', 'A', 'SPAN', 'LABEL'].includes(el.tagName)) {
      return `text="${txt.replace(/"/g, '\\"')}"`;
    }
    return el.tagName.toLowerCase();
  }

  function compileCode() {
    const out = [
      `import { test, expect } from '@playwright/test';`,
      ``,
      `test('Clipboard Cross-Tab Flow', async ({ page, context }) => {`
    ];
    for (let i = 0; i < state.steps.length; i++) {
      const s = state.steps[i], n = state.steps[i + 1];
      if (n && n.action === 'newPage') {
        out.push(`  const ${n.pageId}Promise = context.waitForEvent('page');`);
        out.push(`  ${fmt(s)}`);
        out.push(`  const ${n.pageId} = await ${n.pageId}Promise;`);
        out.push(`  await ${n.pageId}.waitForLoadState();`);
        i++;
        continue;
      }
      out.push(`  ${fmt(s)}`);
    }
    out.push(`});`);
    return out.join('\n');
  }

  function fmt(s) {
    const p = s.pageId || 'page';
    if (s.action === 'goto') return `await ${p}.goto('${s.url}');`;
    if (s.action === 'newPage') return `// Switched to ${p}: ${s.url}`;
    if (s.action === 'click') return `await ${p}.locator('${s.selector}').click();`;
    if (s.action === 'fill') return `await ${p}.locator('${s.selector}').fill('${s.value}');`;
    return `// ${p}: ${s.action}`;
  }

  // 7. 悬浮控制面板 UI
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;bottom:16px;right:16px;width:360px;z-index:2147483647;background:#181825;color:#cdd6f4;padding:12px;border-radius:8px;font-family:monospace;font-size:12px;border:1px solid #cba6f7;box-shadow:0 8px 24px rgba(0,0,0,0.5);';
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
      <b style="color:#cba6f7;">📋 剪贴板同步录制器 [<span id="_c_p">-</span>]</b>
      <span id="_c_cnt">0 步</span>
    </div>
    <pre id="_c_code" style="background:#11111b;padding:8px;height:140px;overflow:auto;margin:0 0 8px;font-size:11px;white-space:pre-wrap;"></pre>
    <div style="display:flex;gap:5px;">
      <button id="_c_sync" style="flex:1.2;padding:6px;background:#a6e3a1;color:#111;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">📥 接力上一Tab</button>
      <button id="_c_cp" style="flex:1;padding:6px;background:#89b4fa;color:#111;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">复制代码</button>
      <button id="_c_json" style="flex:0.8;padding:6px;background:#cba6f7;color:#111;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">JSON</button>
      <button id="_c_clr" style="padding:6px;background:#f38ba8;color:#111;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">清空</button>
    </div>
  `;
  document.body.appendChild(panel);

  function updateUI() {
    document.getElementById('_c_p').textContent = pageId || '-';
    document.getElementById('_c_cnt').textContent = state.steps.length + ' 步';
    document.getElementById('_c_code').textContent = compileCode();
  }

  document.getElementById('_c_sync').onclick = async () => {
    pageId = null;
    await restoreState(true);
    await saveToClipboard();
  };
  document.getElementById('_c_cp').onclick = () => {
    navigator.clipboard.writeText(compileCode());
    alert('已复制 Playwright 脚本！');
  };
  document.getElementById('_c_json').onclick = () => {
    navigator.clipboard.writeText(JSON.stringify(state.steps, null, 2));
    alert('已复制录制 Schema JSON！');
  };
  document.getElementById('_c_clr').onclick = async () => {
    window.name = '';
    pageId = null;
    state = { sessionId: 'clip_' + Date.now(), updatedAt: Date.now(), pageCounter: 0, lastPopupSource: null, pages: {}, steps: [] };
    resolvePageIdentity();
    await saveToClipboard();
    updateUI();
  };

  restoreState(false);
})();