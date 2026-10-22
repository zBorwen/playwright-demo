/**
 * Playwright 跨标签页书签录制器 - 方案2：window.name + URL Hash 零权限接力版
 * 适用：全程零浏览器权限提示，自动拦截 <a>、window.open、<form> 与 location.href 跳转
 */
(function () {
  if (window.__PW_REC_HASH__) {
    alert('Playwright window.name+Hash 版录制器已在当前页面运行！');
    return;
  }
  window.__PW_REC_HASH__ = true;

  const HASH_KEY = '__pw_sync=';
  const WNAME_KEY = '__PW_WNAME_STATE_V2__:';

  let state = {
    updatedAt: Date.now(),
    pageCounter: 0,
    lastPopupSource: null,
    pages: {},
    steps: []
  };
  let pageId = null;

  const encode = (obj) => btoa(encodeURIComponent(JSON.stringify(obj)));
  const decode = (str) => JSON.parse(decodeURIComponent(atob(str)));

  // 1. 立即将状态与当前页身份刷入 window.name（同 Tab 跨域跳转/重定向/刷新不丢失）
  function flushToWindowName() {
    try {
      state.updatedAt = Date.now();
      window.name = WNAME_KEY + encode({ pageId, state });
    } catch (e) {
      console.warn('[PW-Hash] 写入 window.name 失败:', e);
    }
  }

  // 2. 给任意将要打开的 URL 安全拼接 Hash 状态尾巴
  function appendHashToUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
    const trimmed = rawUrl.trim();
    if (trimmed.startsWith('javascript:') || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) {
      return rawUrl;
    }
    try {
      const urlObj = new URL(rawUrl, location.href);
      const cleanHref = urlObj.href.split(HASH_KEY)[0].replace(/[&#]$/, '');
      const joiner = cleanHref.includes('#') ? '&' : '#';
      return cleanHref + joiner + HASH_KEY + encode(state);
    } catch (e) {
      return rawUrl;
    }
  }

  // 3. 启动时恢复状态（优先读取新 Tab 的 URL Hash，其次读取当前 Tab 的 window.name）
  function initRestore() {
    let fromHash = false;
    if (location.hash.includes(HASH_KEY)) {
      try {
        const parts = location.hash.split(HASH_KEY);
        const raw = parts[1].split('&')[0];
        state = decode(raw);
        fromHash = true;
        // 静默抹除地址栏上的 #__pw_sync= 尾巴，不影响业务前端路由
        const cleanHash = parts[0] === '#' ? '' : parts[0].replace(/[&#]$/, '');
        history.replaceState(null, '', location.pathname + location.search + cleanHash);
      } catch (e) {
        console.warn('[PW-Hash] Hash 状态解析失败:', e);
      }
    }

    if (window.name && window.name.startsWith(WNAME_KEY)) {
      try {
        const wData = decode(window.name.replace(WNAME_KEY, ''));
        // 如果是同一个 Tab 内的刷新或 location.href 跳转，保留它原本的 pageId
        if (!fromHash || (wData.pageId && state.pages[wData.pageId])) {
          pageId = wData.pageId;
        }
        if (!fromHash || wData.state.updatedAt > state.updatedAt) {
          state = wData.state;
        }
      } catch (e) {}
    }

    // 自动分配或沿用 page / page1 / page2
    if (pageId && state.pages[pageId]) {
      state.pages[pageId].url = location.href;
    } else if (Object.keys(state.pages).length === 0) {
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

    flushToWindowName();
  }

  // =========================================================================
  // 4. 全场景跳转拦截器（覆盖 a 标签、window.open、form 提交、location.href）
  // =========================================================================

  // 拦截器 A：在 Capture 捕获阶段监听 click（比页面上任何业务 onclick 更早执行）
  document.addEventListener('click', (e) => {
    if (panel.contains(e.target)) return;

    // ⬇️ 这里可替换为你自己的录制 Schema 结构（保留 pageId 即可）
    state.steps.push({
      pageId,
      action: 'click',
      selector: getSelector(e.target),
      url: location.href,
      ts: Date.now()
    });
    // 第一时间刷入 window.name，即使下一毫秒业务代码执行 location.href 跳转也不会丢
    flushToWindowName();

    // 检查是否点击了 <a> 链接
    const link = e.target.closest('a[href]');
    if (link) {
      const href = link.getAttribute('href') || '';
      if (!href.startsWith('#') && !href.startsWith('javascript:')) {
        const isNewTab = link.target === '_blank' || e.ctrlKey || e.metaKey || e.button === 1;
        if (isNewTab) {
          state.lastPopupSource = pageId;
          flushToWindowName();
        }
        // 在浏览器真正发起导航或打开新标签页前，把最新状态塞入 link.href 的 Hash 中
        link.href = appendHashToUrl(link.href);
      }
    }
    updateUI();
  }, true);

  // 拦截器 B：重写 window.open，自动为 JS 打开的新标签页注入 Hash
  const originalWindowOpen = window.open;
  window.open = function (url, target, features) {
    state.lastPopupSource = pageId;
    flushToWindowName();
    const syncedUrl = url ? appendHashToUrl(url.toString()) : url;
    return originalWindowOpen.call(window, syncedUrl, target, features);
  };

  // 拦截器 C：监听表单提交
  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (form && form.target === '_blank') {
      state.lastPopupSource = pageId;
      flushToWindowName();
      if (form.action) form.action = appendHashToUrl(form.action);
    } else {
      flushToWindowName();
    }
  }, true);

  // 拦截器 D：当发生异步 location.href / location.replace / 页面刷新卸载时，确保状态写入 window.name
  window.addEventListener('beforeunload', flushToWindowName, true);
  window.addEventListener('pagehide', flushToWindowName, true);

  // 监听输入框变更
  document.addEventListener('change', (e) => {
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
      flushToWindowName();
      updateUI();
    }
  }, true);

  // =========================================================================
  // 5. 选择器提取与 Playwright 脚本编译
  // =========================================================================
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
      `test('WindowName + Hash Cross-Tab Flow', async ({ page, context }) => {`
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

  // =========================================================================
  // 6. 悬浮控制面板 UI
  // =========================================================================
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;bottom:16px;right:16px;width:360px;z-index:2147483647;background:#1e1e2e;color:#cdd6f4;padding:12px;border-radius:8px;font-family:monospace;font-size:12px;border:1px solid #fab387;box-shadow:0 8px 24px rgba(0,0,0,0.5);';
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
      <b style="color:#fab387;">🔗 window.name+Hash录制器 [<span id="_h_p">-</span>]</b>
      <span id="_h_cnt">0 步</span>
    </div>
    <pre id="_h_code" style="background:#11111b;padding:8px;height:140px;overflow:auto;margin:0 0 8px;font-size:11px;white-space:pre-wrap;"></pre>
    <div style="display:flex;gap:6px;">
      <button id="_h_cp" style="flex:1;padding:6px;background:#fab387;color:#111;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">复制代码</button>
      <button id="_h_json" style="flex:1;padding:6px;background:#89b4fa;color:#111;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">复制JSON</button>
      <button id="_h_clr" style="padding:6px;background:#f38ba8;color:#111;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">清空</button>
    </div>
  `;
  document.body.appendChild(panel);

  function updateUI() {
    document.getElementById('_h_p').textContent = pageId || '-';
    document.getElementById('_h_cnt').textContent = state.steps.length + ' 步';
    document.getElementById('_h_code').textContent = compileCode();
  }

  document.getElementById('_h_cp').onclick = () => {
    navigator.clipboard.writeText(compileCode());
    alert('已复制 Playwright 脚本！');
  };
  document.getElementById('_h_json').onclick = () => {
    navigator.clipboard.writeText(JSON.stringify(state.steps, null, 2));
    alert('已复制录制 Schema JSON！');
  };
  document.getElementById('_h_clr').onclick = () => {
    window.name = '';
    pageId = 'page';
    state = {
      updatedAt: Date.now(),
      pageCounter: 0,
      lastPopupSource: null,
      pages: { page: { pageId: 'page', opener: null, url: location.href } },
      steps: [{ pageId: 'page', action: 'goto', url: location.href, ts: Date.now() }]
    };
    flushToWindowName();
    updateUI();
  };

  initRestore();
  updateUI();
})();