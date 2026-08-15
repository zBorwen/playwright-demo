# NOTE-002-env-file-management: .env 文件生命周期管理

## Status

reviewed

## Context

- Source BugLog or Task: `docs/bugs/BUGLOG-001-bug-log.md`（来源 `BUG_LOG.md`「回放完全不生效 — 前端 WebSocket 连接断开」条目）
- Applicable projects or boundaries: 本仓库及使用 git 追踪配置文件的任何项目

## Conclusion

从 git 追踪中移除 `.env` 等本地运行必需配置文件时，必须使用 `git rm --cached <file>` 保留工作区副本，禁止直接 `git rm <file>` 删除本地文件；`.gitignore` 只负责防止提交，不应导致本地运行必需的配置文件丢失。排查「前端无状态」类问题时，优先检查 WebSocket 连接是否建立（Server 端连接日志是最快信号）。

## Examples

- 教训来源：`697decf` 提交中直接删除 `packages/frontend/.env`（内容 `VITE_WS_URL=ws://localhost:3000/ws`），导致前端 `connect()` 退化连接 `ws://localhost:5173/ws`，`broadcastToClients` 遍历空 Set，所有回放消息被静默丢弃，回放功能整体失效。

## Confidence and Review

- Confidence: high（线上真实故障 + 明确修复路径）
- Reviewed by: hylas
- Reviewed at: 2026-08-15
- Promoted to: `docs/rules/RULE-001-env-file-management.md`
- Promoted by: hylas
- Promoted at: 2026-08-15

## Import Metadata (migrated drafts only)

- Source path: `BUG_LOG.md`
- Source hash / commit / snapshot: `01df96d19f0d631ec6a2d49e68c2aaedf007607bebf33c4b26d71b42f7ca342d` @ `3570734`
- Imported by: opencode
- Imported at: 2026-08-14
