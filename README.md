# Playwright 可视化操作平台

基于 Playwright 的浏览器自动化可视化系统。通过 Web 界面录制用户操作，回放时支持 Mock 模式，替代脆弱的 Selenium/Puppeteer 脚本。

## 架构

```
┌─────────────┐      WebSocket      ┌─────────────┐
│   Frontend  │ ◄─────────────────► │   Server    │
│  React+TW   │                     │  Hono+PG    │
└─────────────┘                     └──────┬──────┘
                                           │ WebSocket
                                    ┌──────▼──────┐
                                    │   Agent     │
                                    │ playwright  │
                                    └─────────────┘
```

- **Server** (`packages/server`) — Hono + PostgreSQL，提供 REST API 和 WebSocket 网关
- **Agent** (`packages/agent`) — 本地运行，通过 playwright-core 控制浏览器执行录制/回放
- **Frontend** (`packages/frontend`) — React + Tailwind 暗色主题的管理界面
- **Shared** (`packages/shared`) — Zod schema 和类型定义

## 快速开始

```bash
# 安装依赖
pnpm install

# 启动 Server（需要 PostgreSQL）
cd packages/server && pnpm dev

# 启动 Frontend
cd packages/frontend && pnpm dev

# 启动 Agent（连接本地 Server）
cd packages/agent && SERVER_URL=ws://localhost:3000/ws pnpm start
```

## 功能

- **可视化录制** — 输入目标 URL → 点击录制 → 本地控制浏览器操作自动捕获
- **语义化存储** — 操作序列存为 JSON + HAR 网络数据 + 元素指纹
- **Mock 回放** — 支持真实 API / HAR Mock 两种回放模式
- **元素指纹** — 采集 data-testid、role、accessibleName 等用于 AI 自愈合
- **实时 WebSocket** — 录制/回放过程实时推送到前端

## 技术栈

| 层 | 技术 |
|---|---|
| Monorepo | pnpm workspace |
| Server | Hono + PostgreSQL + Drizzle ORM + ws |
| Agent | playwright-core + ws |
| Frontend | React 19 + Tailwind CSS (zinc dark) + Zustand + react-router-dom |
| Shared | Zod schemas |

## 测试

```bash
pnpm -r test
```

当前覆盖：63 个测试（14 shared + 18 agent + 12 server + 19 frontend），共 16 个测试文件。
