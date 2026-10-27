/**
 * Playwright 不死宿主版跨 Tab / 跨 SPA 自动注入录制器
 * 核心突破：
 * 1. 首次点击书签立即激活【不死宿主外壳】，无论内部通过 router.push、location.href、<a> 还是 302 跳转到新应用，外层宿主永不销毁！
 * 2. 双重自动重注：页面硬刷新 (load) 自动重注 SDK + 微前端清空 DOM (MutationObserver) 自动复活面板。
 * 3. 新开标签页 (target="_blank" / window.open) 自动传染注入 SDK 并分配 page1、page2。
 * 4. 实时同步剪贴板 + window.name，跨任意场景不丢数据。
 */
(function PW_IMMORTAL_RECORDER() {
  const CLIP_PREFIX = '__PW_IMMORTAL_CLIP_V1__:';
  const WNAME_PREFIX = '__PW_IMMORTAL_WNAME_V1__:';
  const SS_PAGE_ID = '__PW_IMMORTAL_TAB_PAGE_ID__';

  // =========================================================================
  // 阶段一：顶层【不死宿主（Immortal Host）】守护逻辑
  // 只要在顶层窗口点一次书签，顶层窗口就变成永不刷新的监控器，负责给内部页面无限次自动注入 SDK
  // =========================================================================
  if (window.self === window.top && !window.__PW_DISABLE_HOST_SHELL__) {
    if (window.__PW_HOST_RUNNING__) {
      alert('录制器不死宿主已在运行中！');
      return;
    }
    window.__PW_HOST_RUNNING__ = true;

    const initialUrl = location.href;
    const initialTitle = document.title;

    // 将当前顶层窗口改造为全屏透明无感宿主
    document.documentElement.innerHTML = `
      <head>
        <meta charset="utf-8">
        <title>${initialTitle}</title>
        <style>
          html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; background:#fff; }
          #__pw_immortal_frame__ { width:100%; height:100%; border:none; display:block; }
        </style>
      </head>
      <body>
        <iframe id="__pw_immortal_frame__" src="${initialUrl}"></iframe>
      </body>
    `;

    const frame = document.getElementById('__pw_immortal_frame__');

    // 宿主核心能力：向内部窗口或新开 Tab 注入 SDK
    window.__PW_INJECT_INTO_WIN__ = function (targetWin) {
      if (!targetWin) return;
      const timer = setInterval(() => {
        try {
          const doc = targetWin.document;
          if (!doc || targetWin.location.href === 'about:blank') return;

          if (doc.readyState === 'interactive' || doc.readyState === 'complete') {
            if (doc.body && !doc.getElementById('__pw_omni_panel__')) {
              targetWin.__PW_OMNI_ACTIVE__ = false; // 允许重新挂载
              const s = doc.createElement('script');
              // 如果 targetWin 是新开的顶层 Tab，会让它也自动套上不死宿主；如果是内部 iframe，则直接运行录制器
              s.textContent = `(${PW_IMMORTAL_RECORDER.toString()})();`;
              doc.body.appendChild(s);
            }
          }
        } catch (e) {
          // 如果跳到了外部异源域名，无法注入，停止轮询
          clearInterval(timer);
        }
      }, 120);
      setTimeout(() => clearInterval(timer), 15000);
    };

    // 每次内部因为 router.push / location.href / <a> 跳到新应用发生整页刷新时：
    frame.addEventListener('load', () => {
      try {
        const cw = frame.contentWindow;
        const cd = frame.contentDocument;

        // 1. 同步浏览器顶层地址栏 URL 与标题（用户完全感知不到 iframe 的存在）
        const newUrl = cw.location.pathname + cw.location.search + cw.location.hash;
        history.replaceState(null, cd.title, newUrl);
        document.title = cd.title || initialTitle;

        // 2. 注入 SDK
        window.__PW_INJECT_INTO_WIN__(cw);

        // 3. 启动 DOM 卸载守护：防止微前端架构下 router.push 清空了 body 但没触发 iframe load
        const domGuard = new MutationObserver(() => {
          if (cd.body && !cd.getElementById('__pw_omni_panel__')) {
            cw.__PW_OMNI_ACTIVE__ = false;
            const s = cd.createElement('script');
            s.textContent = `(${PW_IMMORTAL_RECORDER.toString()})();`;
            cd.body.appendChild(s);
          }
        });
        domGuard.observe(cd.documentElement, { childList: true, subtree: true });
      } catch (e) {
        // 如果跳转到不同源的外部网站，脱离宿主直接顶层跳转
        location.href = frame.src;
      }
    });

    // 初次启动立即守护
    window.__PW_INJECT_INTO_WIN__(frame.contentWindow);
    return; // 顶层窗口只做永生宿主，具体录制逻辑在下方内部窗口执行
  }

  // =========================================================================
  // 阶段二：内部业务窗口录制与跨 Tab 同步逻辑
  // =========================================================================
  if (window.__PW_OMNI_ACTIVE__ && document.getElementById('__pw_omni_panel__')) return;
  window.__PW_OMNI_ACTIVE__ = true;

  const hostWin = window.top || window;

  let state = {
    sessionId: 'immortal_' + Date.now(),
    updatedAt: 0,
    pageCounter: 0,
    lastPopupSource: null,
    pages: {},
    steps: []
  };
  let pageId = null;

  const encode = (o) => btoa(encodeURIComponent(JSON.stringify(o)));
  const decode = (s) => JSON.parse(decodeURIComponent(atob(s)));

  // 1. 状态持久化（同时存顶层宿主内存 + 顶层 window.name + 系统剪贴板）
  function saveToHostAndWindowName() {
    try {
      state.updatedAt = Date.now();
      hostWin.__PW_SHARED_MEM_STATE__ = JSON.parse(JSON.stringify(state));
      const encoded = WNAME_PREFIX + encode({ pageId, state });
      window.name = encoded;
      hostWin.name = encoded;
    } catch (e) {}
  }

  async function saveAll(writeClip = true) {
    saveToHostAndWindowName();
    if (writeClip) {
      try {
        await navigator.clipboard.writeText(CLIP_PREFIX + JSON.stringify(state));
      } catch (e) {}
    }
  }

  // 2. 多通道状态恢复（宿主内存 > Opener 父窗口内存 > 剪贴板 > window.name）
  async function restoreState(forceClipboard = false) {
    const candidates = [];

    // 通道 A：同 Tab 宿主内存（router.push 跳新应用重注 SDK 时，0 延迟直接从外层宿主拿状态！）
    try {
      if (hostWin.__PW_SHARED_MEM_STATE__) {
        candidates.push(hostWin.__PW_SHARED_MEM_STATE__);
      }
    } catch (e) {}

    // 通道 B：新开 Tab 时，直接从打开它的父窗口 (window.opener) 内存拿状态
    try {
      const openerTop = window.opener?.top || window.opener;
      if (openerTop && openerTop.__PW_SHARED_MEM_STATE__) {
        candidates.push(openerTop.__PW_SHARED_MEM_STATE__);
      }
    } catch (e) {}

    // 通道 C：window.name
    let wnamePageId = null;
    const rawName = hostWin.name || window.name;
    if (!forceClipboard && rawName && rawName.startsWith(WNAME_PREFIX)) {
      try {
        const wData = decode(rawName.replace(WNAME_PREFIX, ''));
        if (wData.state) candidates.push(wData.state);
        if (wData.pageId) wnamePageId = wData.pageId;
      } catch (e) {}
    }

    // 通道 D：系统剪贴板（兜底跨域或手动新开空白 Tab）
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.startsWith(CLIP_PREFIX)) {
        candidates.push(JSON.parse(text.replace(CLIP_PREFIX, '')));
      }
    } catch (e) {}

    for (const c of candidates) {
      if (c && c.updatedAt >= state.updatedAt) {
        state = JSON.parse(JSON.stringify(c));
      }
    }

    pageId = hostWin.sessionStorage.getItem(SS_PAGE_ID) || wnamePageId || null;

    resolvePageIdentity();
    saveToHostAndWindowName();
    updateUI();
  }

  // 3. 自动区分同 Tab 跨应用跳转 (保持 page) 与新开 Tab (分配 page1, page2)
  function resolvePageIdentity() {
    if (pageId && state.pages[pageId]) {
      // 同一个 Tab 内部跳转到了新应用（例如从 /page1 跳到了 /page2）
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

    hostWin.sessionStorage.setItem(SS_PAGE_ID, pageId);
  }

  // =========================================================================
  // 4. 路由变化同步与新开 Tab 自动传染
  // =========================================================================

  // 同步 SPA 内部 pushState / replaceState 到外层地址栏
  const syncUrlToHost = () => {
    try {
      if (state.pages[pageId]) state.pages[pageId].url = location.href;
      if (hostWin !== window) {
        hostWin.history.replaceState(null, document.title, location.pathname + location.search + location.hash);
      }
      saveToHostAndWindowName();
    } catch (e) {}
  };

  ['pushState', 'replaceState'].forEach((method) => {
    const raw = history[method];
    history[method] = function (...args) {
      const res = raw.apply(this, args);
      syncUrlToHost();
      return res;
    };
  });
  window.addEventListener('popstate', syncUrlToHost);
  window.addEventListener('hashchange', syncUrlToHost);

  // 拦截 window.open 打开新标签页 -> 自动把【不死宿主+SDK】传染给新标签页！
  const rawOpen = window.open;
  window.open = function (url, target, features) {
    state.lastPopupSource = pageId;
    saveToHostAndWindowName();
    const childWin = rawOpen.call(window, url, target, features);
    if (hostWin.__PW_INJECT_INTO_WIN__) {
      hostWin.__PW_INJECT_INTO_WIN__(childWin);
    }
    return childWin;
  };

  window.addEventListener('beforeunload', saveToHostAndWindowName, true);
  window.addEventListener('pagehide', saveToHostAndWindowName, true);

  // 捕获点击事件
  document.addEventListener('click', async (e) => {
    const panelEl = document.getElementById('__pw_omni_panel__');
    if (panelEl && panelEl.contains(e.target)) return;

    // ⬇️ 替换为你自己的录制 Schema 结构（保留 pageId 即可）
    state.steps.push({
      pageId,
      action: 'click',
      selector: getSelector(e.target),
      url: location.href,
      ts: Date.now()
    });

    const link = e.target.closest('a[href]');
    if (link) {
      const href = link.getAttribute('href') || '';
      const isNewTab = link.target === '_blank' || e.ctrlKey || e.metaKey || e.button === 1;
      if (isNewTab && !href.startsWith('#') && !href.startsWith('javascript:')) {
        state.lastPopupSource = pageId;
        await saveAll(true);
        updateUI();
        try {
          const targetUrl = new URL(link.href, location.href);
          // 同源新开 Tab：用 window.open 打开以获得句柄，自动传染注入 SDK
          if (targetUrl.origin === location.origin) {
            e.preventDefault();
            window.open(targetUrl.href, '_blank');
            return;
          }
        } catch (err) {}
      }
    }

    updateUI();
    await saveAll(true);
  }, true);

  // 捕获输入事件
  document.addEventListener('change', async (e) => {
    const panelEl = document.getElementById('__pw_omni_panel__');
    if (panelEl && panelEl.contains(e.target)) return;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
      state.steps.push({
        pageId,
        action: 'fill',
        selector: getSelector(e.target),
        value: e.target.value,
        url: location.href,
        ts: Date.now()
      });
      updateUI();
      await saveAll(true);
    }
  }, true);

  // =========================================================================
  // 5. 选择器与 Playwright 代码编译
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
      `test('Immortal Cross-SPA & Cross-Tab Flow', async ({ page, context }) => {`
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
  panel.id = '__pw_omni_panel__';
  panel.style.cssText = 'position:fixed;bottom:16px;right:16px;width:370px;z-index:2147483647;background:#181825;color:#cdd6f4;padding:12px;border-radius:8px;font-family:monospace;font-size:12px;border:1px solid #a6e3a1;box-shadow:0 8px 24px rgba(0,0,0,0.6);';
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
      <b style="color:#a6e3a1;">🛡️ 不死宿主录制器 [<span id="_i_p">-</span>]</b>
      <span id="_i_cnt">0 步</span>
    </div>
    <pre id="_i_code" style="background:#11111b;padding:8px;height:140px;overflow:auto;margin:0 0 8px;font-size:11px;white-space:pre-wrap;"></pre>
    <div style="display:flex;gap:5px;">
      <button id="_i_sync" style="flex:1.2;padding:6px;background:#a6e3a1;color:#111;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">📥 剪贴板接力</button>
      <button id="_i_cp" style="flex:1;padding:6px;background:#89b4fa;color:#111;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">复制代码</button>
      <button id="_i_json" style="flex:0.8;padding:6px;background:#cba6f7;color:#111;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">JSON</button>
      <button id="_i_clr" style="padding:6px;background:#f38ba8;color:#111;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">清空</button>
    </div>
  `;
  document.body.appendChild(panel);

  function updateUI() {
    const pEl = document.getElementById('_i_p');
    const cEl = document.getElementById('_i_cnt');
    const codeEl = document.getElementById('_i_code');
    if (pEl) pEl.textContent = pageId || '-';
    if (cEl) cEl.textContent = state.steps.length + ' 步';
    if (codeEl) codeEl.textContent = compileCode();
  }

  document.getElementById('_i_sync').onclick = async () => {
    hostWin.sessionStorage.removeItem(SS_PAGE_ID);
    pageId = null;
    await restoreState(true);
    await saveAll(true);
  };
  document.getElementById('_i_cp').onclick = () => {
    navigator.clipboard.writeText(compileCode());
    alert('已复制 Playwright 脚本！');
  };
  document.getElementById('_i_json').onclick = () => {
    navigator.clipboard.writeText(JSON.stringify(state.steps, null, 2));
    alert('已复制录制 Schema JSON！');
  };
  document.getElementById('_i_clr').onclick = async () => {
    hostWin.sessionStorage.removeItem(SS_PAGE_ID);
    hostWin.__PW_SHARED_MEM_STATE__ = null;
    window.name = '';
    hostWin.name = '';
    pageId = null;
    state = { sessionId: 'immortal_' + Date.now(), updatedAt: Date.now(), pageCounter: 0, lastPopupSource: null, pages: {}, steps: [] };
    resolvePageIdentity();
    await saveAll(true);
    updateUI();
  };

  restoreState(false);
})();
