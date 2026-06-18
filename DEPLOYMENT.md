# 部署指南

## 环境要求

- Node.js >= 24
- SQLite（嵌入式，无需额外安装）
- pnpm >= 9

## 本地开发

```bash
pnpm install

# 数据库初始化
cd packages/server && pnpm db:push

# 启动各服务（三个终端）
cd packages/server && pnpm dev          # http://localhost:3000
cd packages/frontend && pnpm dev        # http://localhost:5173
cd packages/agent && pnpm start         # WebSocket → localhost:3000
```

## 环境变量

### Server

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | HTTP 端口 |
| `DATABASE_PATH` | `./storage/playwright-demo.db` | SQLite 数据库文件路径 |
| `STORAGE_PATH` | `./storage` | 本地存储路径（HAR、截图、JSON） |

### Agent

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SERVER_URL` | `ws://localhost:3000/ws` | Server WebSocket 地址 |
| `AGENT_TOKEN` | — | 认证 Token（可选） |

### Frontend

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `VITE_API_URL` | `/api` | API 基础路径 |

## 生产部署

### 1. 构建

```bash
pnpm install --frozen-lockfile
pnpm -r build
```

### 2. 数据库

```bash
cd packages/server
DATABASE_PATH=./storage/playwright-demo.db pnpm db:push
```

### 3. 启动

```bash
# Server
cd packages/server
NODE_ENV=production pnpm start

# Agent（用户本地运行，或部署到同一服务器）
cd packages/agent
SERVER_URL=ws://your-server/ws pnpm start

# Frontend（构建产物由 Nginx 或 Node 静态服务）
cd packages/frontend
pnpm build
# dist/ 目录部署到静态服务器
```

## Docker

```dockerfile
# Server
FROM node:24-alpine AS server
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN corepack enable && pnpm install --frozen-lockfile --prod
COPY packages/shared packages/shared
COPY packages/server packages/server
EXPOSE 3000
CMD ["node", "packages/server/src/index.ts"]

# Frontend build
FROM node:24-alpine AS frontend-build
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/frontend/package.json packages/frontend/
RUN corepack enable && pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY packages/frontend packages/frontend
RUN cd packages/frontend && pnpm build

# Frontend serve
FROM nginx:alpine AS frontend
COPY --from=frontend-build /app/packages/frontend/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```
