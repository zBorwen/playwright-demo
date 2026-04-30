# Recorder 系统架构文档

## 概述

本系统使用 playwright-core 内部 Recorder API 实现浏览器用户交互的录制，输出三种格式：
- **Timeline**：操作序列，前端实时展示
- **Codegen**：生成的 Playwright 代码
- **JSON**：序列化后的 actions，供回放和编辑使用

## 核心模块

### playwright-core 内部模块

| 文件路径 | 导出 | 作用 |
|----------|------|------|
| `lib/server/recorder.js` | `Recorder`, `RecorderEvent` | Recorder 核心类，管理录制状态和事件发射 |
| `lib/server/recorder/recorderApp.js` | `ProgrammaticRecorderApp`, `RecorderApp` | 两种 UI 模式：纯程序化 vs Inspector 窗口 |
| `lib/server/codegen/javascript.js` | — | JavaScript / Playwright-Test 代码生成器 |
| `lib/server/codegen/language.js` | `generateCode` | 通用代码生成逻辑 |
| `lib/server/codegen/languages.js` | `languageSet` | 所有语言集合 |
| `lib/server/recorder/recorderUtils.js` | `collapseActions`, `shouldMergeAction`, `buildFullSelector` | 工具函数 |
| `lib/client/browserContext.js` | `_enableRecorder` | 客户端 Recorder 入口 |
| `lib/server/dispatchers/browserContextDispatcher.js` | `enableRecorder` | 服务端分发器 |

### 项目文件

| 文件 | 职责 |
|------|------|
| `packages/agent/src/internal-modules.ts` | 通过 `createRequire` 加载 playwright-core 内部模块 |
| `packages/agent/src/recorder-manager.ts` | Recorder 管理：启动/停止/事件处理/三种格式输出 |
| `packages/agent/src/fingerprint.ts` | 元素指纹采集（data-testid, role, text, boundingBox 等） |
| `packages/agent/src/index.ts` | Agent 入口，WS 消息处理 |
| `packages/server/src/routes/recordings.ts` | REST API：创建/查询/保存录制 |
| `packages/frontend/src/components/recording-detail.tsx` | 录制详情页：Timeline / Codegen / JSON / 执行历史 |
| `packages/frontend/src/components/recording-json-editor.tsx` | JSON 编辑器 |

## 事件流（完整链路）

```
用户在浏览器中的 DOM 操作
  → pollingRecorderSource 注入脚本监听 click/input/keydown 等事件
    → 通过 __pw_recorderRecordAction binding 上报到 Server
      → Server RecorderSignalProcessor.addAction()
        → emit(RecorderEvent.ActionAdded, actionInContext)
          → ProgrammaticRecorderApp.run 监听事件
            → generateCode([action], languageGenerator) 生成代码行
              → context.emit(RecorderEvent, { event: "actionAdded", data, page, code })
                → channel 分发到 Client
                  → client._onRecorderEventSink.actionAdded(page, data, code)
                    → RecorderManager.handleRecorderAction()
                      → 转换为 RecordingAction + 元素 fingerprint
                        → 发送给前端 (WS record:action)
```

## RecorderEvent 类型

```typescript
const RecorderEvent = {
  PausedStateChanged: "pausedStateChanged",
  ModeChanged: "modeChanged",
  ElementPicked: "elementPicked",
  CallLogsUpdated: "callLogsUpdated",
  UserSourcesChanged: "userSourcesChanged",
  ActionAdded: "actionAdded",        // 核心：新操作
  SignalAdded: "signalAdded",        // 信号：导航/popup/download
  PageNavigated: "pageNavigated",
  ContextClosed: "contextClosed",
};
```

## eventSink 接口

```typescript
eventSink = {
  actionAdded(page: Page, data: RecorderActionData, code: string): void,
  actionUpdated(page: Page, data: RecorderActionData, code: string): void,  // fill 合并等
  signalAdded(page: Page, data: SignalData): void,
}
```

`data.action` 结构：

```typescript
interface RecorderActionData {
  action: {
    name: string;       // "click" | "fill" | "press" | "navigate" | "select" | "check" | "uncheck"
    selector?: string;
    url?: string;
    value?: string;
    text?: string;
    key?: string;
    options?: string[];
    signals?: unknown[];
  };
  frame: { pageGuid: string };
}
```

## _enableRecorder 参数完整列表

调用方式：`await context._enableRecorder(params, eventSink)`

| 参数 | 类型 | 说明 | 我们的值 |
|------|------|------|----------|
| `mode` | `"recording"` \| `"inspecting"` \| `"none"` | Recorder 工作状态 | `'recording'` |
| `recorderMode` | `"api"` \| `"default"` | `"api"` → 无 UI 程序化录制；`"default"` → 开 Inspector 窗口 | `'api'` |
| `language` | string | 代码生成语言：`playwright-test`, `javascript`, `python`, `java`, `csharp` | `'playwright-test'` |
| `launchOptions` | object | 透传到 codegen 生成器（`tracesDir` 会被剥离） | `{ headless: false }` |
| `contextOptions` | object | 透传到 codegen 生成器 | `{}` |
| `handleSIGINT` | boolean | 是否拦截 Ctrl+C | `false` |
| `hideToolbar` | boolean | 注入脚本的浮动工具栏是否隐藏 | `true` |
| `omitCallTracking` | boolean | 跳过 onBeforeCall/afterCall 追踪（recording 模式自动跳过） | 不传 |
| `testIdAttributeName` | string | 自定义 testId 属性名 | 不传（默认 data-testid） |
| `outputFile` | string | 生成代码写入文件路径 | 不传（eventSink 手动收集） |
| `device` | string | 设备模拟名称 | 不传 |
| `saveStorage` | string | 保存 storage 状态路径 | 不传 |

### 关键分支逻辑

```javascript
// RecorderApp.show() 中的关键决策
if (params.recorderMode === "api") {
  // 纯程序化：不开额外窗口，事件通过 eventSink 回调
  await ProgrammaticRecorderApp.run(context, recorder, browserName, params);
} else {
  // 开一个独立的 Inspector 浏览器窗口显示 codegen
  await RecorderApp._show(recorder, context, params);
}
```

## 代码生成

`generateCode(actions, languageGenerator, options)` 返回：

```typescript
{
  header: string,       // 例如 "const { test, expect } = require('@playwright/test');\n\ntest('test', async ({ page }) => {"
  footer: string,       // 例如 "});"
  actionTexts: string[], // 每行代码，如 "await page.getByRole('textbox').fill('hello');"
  text: string,         // 完整拼接结果
}
```

### 两种 JS 语言差异

- `playwright-test`：`test('test', async ({ page }) => { ... })` 包裹
- `javascript`：纯脚本 `const page = await context.newPage(); ...`
- `_generateActionCall` 输出的 action 代码完全相同，区别仅在 header/footer

## 三种输出格式

### 1. Timeline

```typescript
// actions[] 通过 WS record:action 消息实时推送前端
{
  name: 'click',
  selector: 'input[type="text"]',
  button: 'left',
  modifiers: 0,
  clickCount: 1,
  signals: [],
  elementInfo: ElementFingerprint,
  pageContext: { url: string, title: string },
  timestamp: number,
}
```

### 2. Codegen

```typescript
// codegenLines[] 每次 actionAdded/actionUpdated 收集
// 最终合并为完整字符串
"await page.getByRole('textbox').fill('hello');
await page.getByRole('button', { name: 'Submit' }).click();"
```

### 3. JSON

```typescript
// actions 序列化为 JSON，前端 JSON 编辑器可编辑
// 通过 saveRecordingActions 保存到服务器
```

## 前端架构

```
前端 (React) ──WS── Server (Hono) ──WS── Agent (tsx)
                                        │
                              context._enableRecorder(params, eventSink)
                                        │
                              ProgrammaticRecorderApp.run
                                        │
                              eventSink: actionAdded / actionUpdated / signalAdded
                                        │
                              RecorderManager → 三种格式输出
```

### WS 消息流

```
Agent → Frontend:
  record:action     → 单个操作，实时追加到 timeline
  record:complete   → { actions[], codegen, harPath }，停止时发送
  record:pong       → 心跳

Frontend → Agent (via Server):
  record:start      → { targetUrl, recordingId }
  record:stop       → { recordingId }
```

## 元素指纹

`captureFingerprint(page, selector)` 返回：

```typescript
interface ElementFingerprint {
  dataTestId: string | null;
  dataTest: string | null;
  role: string | null;
  accessibleName: string | null;
  textContent: string | null;
  placeholder: string | null;
  id: string | null;
  tagName: string;
  labelText: string | null;
  name: string | null;
  inputType: string | null;
  classes: string[];
  parentPath: string[];     // 最多 6 层祖先标签名
  nearbyText: string[];     // 最多 5 条附近文本
  boundingBox: { x, y, width, height } | null;
  isVisible: boolean;
}
```

采集流程：
1. 通过 `page.$(selector)` 获取 ElementHandle
2. 在页面上下文中执行 `FINGERPRINT_JS` 脚本
3. 脚本读取元素属性并返回 JSON 字符串
4. 包含 detached 元素 guard（`typeof el.getBoundingClientRect !== 'function'`）

## 已知问题和修复记录

| 问题 | 根因 | 修复 |
|------|------|------|
| 录制无内容 | 没用内部 Recorder API，自己注入脚本 | 改用 `_enableRecorder + eventSink` |
| 开额外 Inspector 窗口 | 没传 `recorderMode` 默认 `"default"` | 设为 `"api"` |
| 工具栏/面板显示 | `hideToolbar` 未传 | 设为 `true` |
| language 不是默认值 | 误用 `'javascript'` | 改为 `'playwright-test'` |
| 停止录制数据丢失 | WS 消息中 actions 被丢弃，去服务器 fetch 时还没保存 | `record:complete` 直接使用 payload.actions + 自动保存 |
| codegen 不显示 | 前端没有 Codegen tab | 新增 Codegen tab + 复制按钮 |
| 保存 API 400 | server validator 要求 `{ recordingId, targetUrl, title, actions }` | validator 改为只要求 `{ actions }` |
| fingerprint 崩溃 detached 元素 | `getBoundingClientRect is not a function` | 添加类型检查 guard |
| navigate 事件传 URL 当 CSS selector | `page.$()` 解析失败 | navigate 事件跳过 fingerprint |
