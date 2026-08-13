<!-- ⚠️ 本文件由 ontology/project-ontology.json 自动生成，禁止手工编辑。修改请编辑本体后运行 pnpm docs:gen（目标：DEPLOYMENT.md） -->


# 部署指南

## 环境要求

- Node.js >= 24
- PostgreSQL >= 15
- pnpm >= 9

## 本地开发

```bash
pnpm install
cd packages/server && pnpm db:push
cd packages/server && pnpm dev   # http://localhost:3000
cd packages/frontend && pnpm dev # http://localhost:5173
cd packages/agent && pnpm start  # WebSocket → localhost:3000
```

## 环境变量

### Server

| 变量 | 默认值 |
|------|--------|
| `PORT` | `3000` |
| `DATABASE_URL` | `postgres://localhost:5432/playwright_demo` |
| `STORAGE_PATH` | `./storage` |

### Agent

| 变量 | 默认值 |
|------|--------|
| `SERVER_URL` | `ws://localhost:3000/ws` |
| `AGENT_TOKEN` | `—（可选）` |

### Frontend

| 变量 | 默认值 |
|------|--------|
| `VITE_API_URL` | `/api` |

## 生产部署

1. 构建 server 与 frontend（pnpm build）
2. frontend dist/ 部署到静态服务器（Nginx 或 Node）
3. server 使用 node packages/server/src/index.ts 运行
4. Docker 多阶段构建：node:24-alpine（server）+ nginx:alpine（frontend）

