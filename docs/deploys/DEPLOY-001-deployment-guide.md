# DEPLOY-001-deployment-guide: 部署指南（历史文档）

## Status

planned (imported draft)

## CodeChange

- Commit or version: （来源为通用指南，非单次部署）

## Target

- Environment: 本地开发 / 生产（Nginx 或 Node 静态服务）/ Docker
- Configuration reference: `DEPLOYMENT.md` 中的环境变量表（PORT、DATABASE_URL、STORAGE_PATH、SERVER_URL、AGENT_TOKEN、VITE_API_URL）
- Rollout: 本地三终端启动；生产 `pnpm -r build` + `db:push` + 分服务启动；Docker 多阶段构建（Server + Frontend build + Nginx serve）

## Result

- Started at:
- Finished at:
- Result:
- Evidence:

## Import Metadata (migrated drafts only)

- Source path: `DEPLOYMENT.md`
- Source hash / commit / snapshot: `097f64220ecffe968a762806457059f1ac6e2233e6832ba2d0ec44ebf010bd70` @ `3570734`
- Imported by: opencode
- Imported at: 2026-08-14
