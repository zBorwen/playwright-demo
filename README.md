<!-- ⚠️ 本文件由 ontology/project-ontology.yaml 自动生成，禁止手工编辑。修改请编辑本体后运行 pnpm docs:gen（目标：README.md） -->


# playwright-demo — 基于 Playwright 的浏览器自动化可视化系统 / E2E 测试平台

通过 Web 界面录制用户操作，回放时支持 Mock 模式，替代脆弱的 Selenium/Puppeteer 脚本。 已实现录制、回放、Mock、代码生成、批量回放等核心功能。

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

- 可视化录制 — 输入目标 URL → 点击录制 → 本地控制浏览器操作自动捕获
- 语义化存储 — 操作序列存为 JSON + HAR 网络数据 + 元素指纹
- Mock 回放 — 支持真实 API / HAR Mock 两种回放模式
- 元素指纹 — 采集 data-testid、role、accessibleName 等用于 AI 自愈合
- 实时 WebSocket — 录制/回放过程实时推送到前端

## 快速开始

```bash
# pnpm install
# cd packages/server && pnpm db:push
# cd packages/server && pnpm dev
# cd packages/frontend && pnpm dev
# cd packages/agent && SERVER_URL=ws://localhost:3000/ws pnpm start
```

## 技术栈

| 层 | 技术 |
|---|------|
| Monorepo | pnpm workspace |
| Server | Hono + PostgreSQL + Drizzle ORM + ws |
| Agent | playwright-core + ws |
| Frontend | React 19 + Tailwind CSS (zinc dark) + Zustand + react-router-dom |
| Shared | Zod schemas |

## 测试

```bash
pnpm -r test
cd packages/shared && pnpm test
cd packages/agent && pnpm test
cd packages/server && pnpm test
cd packages/frontend && pnpm test
```

测试策略与覆盖率目标详见 [TESTING.md](TESTING.md)。

## 本体驱动文档

本仓库的文档体系以 **ontology/project-ontology.yaml** 为唯一事实源。

- 本体：`ontology/project-ontology.yaml`
- 生成：`pnpm docs:gen`
- 校验：`pnpm ontology:check`

生成文档清单：`README.md`、`CLAUDE.md`、`GEMINI.md`、`AGENTS.md`、`TESTING.md`、`DEPLOYMENT.md`。

