# DEV_NOTE — 开发笔记

## Recorder 集成方案

当前使用注入 JS 事件监听捕获用户操作，替代方案是 playwright-core 内部 recorder API。

### 当前方案（注入 JS）
- 优点：不依赖内部 API，版本兼容性好
- 缺点：只能捕获简单事件，无法捕获复杂交互（拖拽、右键菜单等）

### 内部 API 方案
- 路径：`playwright-core/lib/server/recorder`
- 优点：完整捕获所有交互类型，与 Playwright 官方 recorder 一致
- 缺点：内部 API，可能随版本变化

## 数据库选择

当前使用 PostgreSQL + Drizzle ORM。

- 适合多用户、多项目场景
- 如果只个人使用，可考虑 SQLite（Drizzle 支持）

## WebSocket 消息协议

当前消息类型：
- Server → Agent: `record:start`, `record:screenshot`, `record:stop`, `replay:start`, `replay:stop`, `ping`
- Agent → Server: `record:action`, `record:screenshot:result`, `record:complete`, `replay:step`, `replay:screenshot`, `replay:done`, `pong`

心跳间隔：30s

## 存储结构

```
storage/
├── recordings/
│   └── {recordingId}/
│       ├── actions.json    # 录制动作（语义化 JSON）
│       └── recording.har   # 网络请求记录
└── executions/
    └── {executionId}/
        ├── screenshots/    # 回放截图
        │   └── step-{n}.png
        └── replay.har      # 回放时的 HAR
```

## TypeScript 版本

项目 TypeScript >= 5.7，VS Code 需要选择 Workspace 版本。

## Node.js 版本

Node.js 24+，可直接运行 .ts 文件（tsx）。
