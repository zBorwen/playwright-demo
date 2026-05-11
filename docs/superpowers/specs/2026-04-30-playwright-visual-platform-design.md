# Playwright 可视化操作平台 - 设计文档

> 日期：2026-04-30
> 状态：待审查

## 概述

基于 Playwright 的浏览器自动化可视化操作平台。解决传统 Selenium/Puppeteer 脚本脆弱、维护成本高的问题，通过可视化录制 + JSON 语义化存储 + 自愈能力，降低 E2E 测试门槛。

## 核心价值

1. **可视化录制** — 输入 URL，点击 Record，操作自动记录
2. **语义化存储** — JSON + HAR 分离，非技术人员也能理解
3. **自愈能力** — 丰富的元素指纹 + Replay Agent 自动修复
4. **Mock 回放** — 录制网络请求，回放时可切换真实/mock 模式

---

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────┐
│              Server (Hono + PostgreSQL)          │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐  │
│  │ API      │  │ WebSocket │  │ Storage      │  │
│  │ Routes   │  │ Gateway   │  │ Service      │  │
│  │ REST     │  │ ↔ Agent   │  │ JSON + HAR   │  │
│  └──────────┘  └───────────┘  └──────────────┘  │
└──────────────────────┬──────────────────────────┘
                       │ WebSocket
┌──────────────────────┴──────────────────────────┐
│          Local Agent (Node.js + playwright-core) │
│  ┌────────────┐  ┌───────────┐  ┌────────────┐  │
│  │ Recorder   │  │ Fingerprint│  │ Replay     │  │
│  │ Manager    │  │ Collector  │  │ Engine     │  │
│  │ (内部API)   │  │ (异步)    │  │            │  │
│  └────────────┘  └───────────┘  └────────────┘  │
└──────────────────────┬──────────────────────────┘
                       │ 受控浏览器
┌──────────────────────┴──────────────────────────┐
│         Frontend (React + shadcn/ui)            │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐  │
│  │ Timeline │  │ JSON/     │  │ Replay       │  │
│  │ (只读)   │  │ Codegen   │  │ 配置+结果     │  │
│  └──────────┘  └───────────┘  └──────────────┘  │
└─────────────────────────────────────────────────┘
```

### 技术栈

| 模块 | 技术栈 |
|------|--------|
| Server | Hono + PostgreSQL + Zod |
| Agent | Node.js + playwright-core（内部 API + 公共 API） |
| Frontend | React + shadcn/ui + Tailwind CSS |
| 共享层 | Zod schema + TypeScript types |

### 代码仓库

Monorepo 结构：

```
playwright-demo/
├── pnpm-workspace.yaml
├── packages/
│   ├── server/        ← Hono API + WebSocket Gateway + 存储
│   ├── agent/         ← 本地进程，Recorder + Fingerprint + Replay
│   ├── frontend/      ← React 管理界面
│   └── shared/        ← Zod schema + 共享类型
```

---

## 核心功能

### 1. 录制（Record）

**流程**：
1. 用户在 Web 输入 targetUrl，点击 Record
2. Server 通过 WebSocket 发送 `record:start` 指令给 Agent
3. Agent 调用 playwright-core 内部 recorder API 启动受控浏览器
4. 用户操作 → Recorder 实时吐 action → Agent 异步采集指纹 → 推送到 Server
5. 用户点击 Stop → Agent 推送完整 JSON + HAR → 关闭浏览器

**采集管道（三条异步，互不阻塞）**：

```
Recorder 内部 API → action + selector + network context
公共 API (page.$ + evaluate) → element fingerprint
HAR Tracer → network 请求/响应
```

**最终输出**：
- `actions.json` — 语义化 action 列表，带 elementInfo
- `recording.har` — 录制期间的网络请求

**存储策略**：JSON 双写（DB + 本地文件），HAR/截图只存本地。

### 2. 回放（Replay）

**流程**：
1. 用户在 Web 选择 Recording，进入 Replay 配置页
2. 配置 Mock 规则（哪些 API 走 mock，哪些走真实）
3. Server 发送 `replay:start` 给 Agent，携带 actions + harRef + mockRules
4. Agent 加载 JSON + HAR，逐条执行
5. 执行结果回传 Server（状态、截图、trace）

**截图策略**：
- JSON 中 action 标记 `screenshot: true` → 回放时自动截图
- 回放失败 → 自动截图 + trace

**编辑能力**：录制完成后通过 JSON 编辑器修改，直接改本地/DB 文件。

### 3. 前端展示

**页面结构**：
```
/projects/[id]/
  ├── recordings/          ← Recording 列表
  └── replays/             ← Replay 历史

/recording/[id]/
  ├── timeline             ← 只读卡片，点击关联 JSON 高亮
  ├── json                 ← 预览 + 编辑
  └── codegen              ← 代码生成预览（TS）

/replay/[id]/
  ├── config               ← Mock 配置（可编辑 mock 响应）
  └── result               ← 状态/trace/network 详情

/network/[executionId]/    ← 单次回放的 Network 详情
```

**Timeline 设计**：
- 只读卡片，展示 action 序列
- 点击某一项 → 侧边栏展开对应的 JSON 片段
- 不支持拖拽排序（test case 顺序固定）

---

## Agent 内部结构

```
agent/
├── src/
│   ├── index.ts              ← CLI 入口
│   ├── ws-client.ts          ← WebSocket 客户端
│   ├── recorder-manager.ts   ← recorder 生命周期管理
│   ├── fingerprint.ts        ← 异步指纹采集
│   ├── replay-engine.ts      ← 回放引擎
│   ├── har-merger.ts         ← HAR 与 action 时间关联
│   └── types.ts              ← 消息类型
```

### 指纹采集（ElementInfo）

```typescript
interface ElementInfo {
  // 第一梯队：自愈最有用
  dataTestId: string | null;
  dataTest: string | null;
  role: string | null;
  accessibleName: string | null;
  textContent: string | null;  // 截断到 100 字符
  placeholder: string | null;

  // 第二梯队：辅助定位
  id: string | null;
  tagName: string;             // 小写
  labelText: string | null;
  name: string | null;         // form 元素 name 属性
  inputType: string | null;
  classes: string[];

  // 第三梯队：上下文信息
  parentPath: string[];        // html > body > form > button
  nearbyText: string[];        // 周围可见文本
  boundingBox: { x, y, width, height } | null;
  isVisible: boolean;
}
```

### Recorder 内部 API 输出

```typescript
interface ActionInContext {
  frame: { pageGuid: string; pageAlias: string; framePath: string[] };
  description?: string;
  action: ClickAction | FillAction | HoverAction | NavigateAction | ...;
  startTime: number;
  endTime?: number;
}
```

Action types：click, fill, hover, press, select, check, uncheck, setInputFiles, navigate, openPage, closePage, assertText, assertValue, assertChecked, assertVisible, assertSnapshot

---

## WebSocket 消息协议

### 连接管理

- **心跳** — Agent 每 30s 发送 `ping`，Server 回复 `pong`
- **重连** — Agent 断线后自动重连，Server 保留 session 60s
- **认证预留** — 连接握手携带 `token` 字段（暂不校验）

### Server → Agent

| 消息 | 内容 | 说明 |
|------|------|------|
| `record:start` | `{ targetUrl, recordingId }` | 启动录制 |
| `record:screenshot` | `{ actionIndex }` | 用户手动触发截图 |
| `record:stop` | `{ recordingId }` | 停止录制 |
| `replay:start` | `{ recordingId, actions, harRef, mockRules }` | 启动回放 |
| `replay:stop` | `{ replayId }` | 停止回放 |

### Agent → Server

| 消息 | 内容 | 说明 |
|------|------|------|
| `record:action` | `{ action, selector, elementInfo, timestamp }` | 每步操作实时推送 |
| `record:screenshot:result` | `{ actionIndex, path }` | 截图完成 |
| `record:complete` | `{ recordingId, actions, harPath }` | 录制完成，推送完整 JSON |
| `replay:step` | `{ index, status }` | 回放每步状态 |
| `replay:screenshot` | `{ stepIndex, path }` | 回放中截图 |
| `replay:done` | `{ status, trace?, screenshot? }` | 回放完成 |

---

## 数据库设计

```sql
-- 项目
projects (
  id          UUID PK,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMP,
  updated_at  TIMESTAMP
)

-- 录制流程
recordings (
  id          UUID PK,
  project_id  UUID FK → projects,
  title       TEXT NOT NULL,
  target_url  TEXT,
  created_at  TIMESTAMP,
  updated_at  TIMESTAMP
)

-- 录制产物（actions JSON 内容存 DB）
recording_artifacts (
  id          UUID PK,
  recording_id UUID FK → recordings,
  type        TEXT NOT NULL,  -- 'actions' | 'har'
  content     TEXT,            -- JSON 字符串或文件路径
  created_at  TIMESTAMP
)

-- 回放执行
executions (
  id          UUID PK,
  recording_id UUID FK → recordings,
  status      TEXT NOT NULL,   -- 'running' | 'passed' | 'failed'
  started_at  TIMESTAMP,
  finished_at TIMESTAMP,
  error       TEXT,
  trace       TEXT
)

-- 回放产物
execution_artifacts (
  id          UUID PK,
  execution_id UUID FK → executions,
  type        TEXT NOT NULL,  -- 'screenshot' | 'har'
  path        TEXT NOT NULL,
  step_index  INT             -- 关联到哪个 action step
)
```

---

## 文件存储

```
storage/
├── recordings/
│   └── {recordingId}/
│       ├── actions.json       ← 本地副本（Agent 直接读取）
│       └── recording.har      ← 网络请求归档
├── executions/
│   └── {executionId}/
│       ├── screenshots/
│       │   ├── step-3.png
│       │   └── step-7.png
│       ├── replay.har
│       └── failure-screenshot.png
└── agent/
    └── (临时文件)
```

---

## 共享 Schema (Zod)

```typescript
// packages/shared/schema/recording.ts

export const ElementInfoSchema = z.object({
  dataTestId: z.string().nullable(),
  dataTest: z.string().nullable(),
  role: z.string().nullable(),
  accessibleName: z.string().nullable(),
  textContent: z.string().nullable(),
  placeholder: z.string().nullable(),
  id: z.string().nullable(),
  tagName: z.string(),
  labelText: z.string().nullable(),
  name: z.string().nullable(),
  inputType: z.string().nullable(),
  classes: z.array(z.string()),
  parentPath: z.array(z.string()),
  nearbyText: z.array(z.string()),
  boundingBox: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).nullable(),
  isVisible: z.boolean(),
});

export const ClickActionSchema = z.object({
  name: z.literal('click'),
  selector: z.string(),
  button: z.enum(['left', 'middle', 'right']).default('left'),
  modifiers: z.number().default(0),
  clickCount: z.number().default(1),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  signals: z.array(z.discriminatedUnion('name', [
    z.object({ name: z.literal('navigation'), url: z.string() }),
    z.object({ name: z.literal('popup'), popupAlias: z.string() }),
    z.object({ name: z.literal('download'), downloadAlias: z.string() }),
    z.object({ name: z.literal('dialog'), dialogAlias: z.string() }),
  ])),
});

export const FillActionSchema = z.object({
  name: z.literal('fill'),
  selector: z.string(),
  text: z.string(),
  signals: z.array(z.discriminatedUnion('name', [
    z.object({ name: z.literal('navigation'), url: z.string() }),
    z.object({ name: z.literal('popup'), popupAlias: z.string() }),
    z.object({ name: z.literal('download'), downloadAlias: z.string() }),
    z.object({ name: z.literal('dialog'), dialogAlias: z.string() }),
  ])),
});

export const NavigateActionSchema = z.object({
  name: z.literal('navigate'),
  url: z.string(),
  signals: z.array(z.any()),
});

// ... 其他 action 类型 (hover, press, select, check, uncheck, assert*)

export const ActionSchema = z.discriminatedUnion('name', [
  ClickActionSchema,
  FillActionSchema,
  // ... 所有 action 类型
]);

export const RecordingSchema = z.object({
  recordingId: z.string().uuid(),
  targetUrl: z.string().url(),
  actions: z.array(ActionSchema.extend({
    elementInfo: ElementInfoSchema,
    pageContext: z.object({ url: z.string(), title: z.string() }),
    timestamp: z.number(),
    harRef: z.string().optional(),
    screenshot: z.boolean().optional(),
  })),
});
```

---

## 安全

- `.env` 文件不访问，涉及敏感操作由脚本交由用户手动执行
- Agent 与 Server 连接预留 token 字段，暂不启用认证
- HAR 文件可能包含敏感请求数据，存储时注意访问控制

---

## 关键约束

1. **录制零延迟** — Recorder 管道不阻塞，指纹采集完全异步
2. **JSON 格式严格校验** — Agent 输出前必须通过 Zod schema 校验
3. **HAR 与 action 时间关联** — 通过时间戳对齐，不扩展 recorder 内部结构
4. **自愈依赖 elementInfo** — 不是 selector 字符串，而是多维特征匹配

---

## 待讨论

- **Agent 自愈时的元素信息格式优化** — 兄弟节点、父节点层级等上下文信息
- **Mock 数据编辑界面的交互细节**
- **Replay Agent 自愈的具体流程和策略**
