# RULE-001-env-file-management: .env 等本地必需配置文件的 git 处理规则

## Status

active

## Rule

从 git 追踪移除 `.env` 等本地运行必需的配置文件时，使用 `git rm --cached` 保留工作区副本，禁止直接 `git rm` 删除本地文件。

## Scope

- 本仓库所有包（packages/frontend、packages/server、packages/agent 等）
- 任何通过 `.gitignore` 排除但本地运行依赖的配置文件

## Rationale

- Source DevNote: `docs/devnotes/NOTE-002-env-file-management.md`
- Why this is stable and broadly applicable: `697decf` 提交直接删除 `packages/frontend/.env` 导致前端 WebSocket 静默断连、回放功能整体失效的真实故障；`.gitignore` 的职责仅是防止提交，删除工作区文件破坏本地可运行性，属于可复现且代价高的操作失误。

## Approval

- Approved by: hylas
- Approved at: 2026-08-15

## Enforcement

- Severity: high
- Effective from: 2026-08-15

## Import Metadata (migrated drafts only)

- Source path: `BUG_LOG.md`
- Source hash / commit / snapshot: `01df96d19f0d631ec6a2d49e68c2aaedf007607bebf33c4b26d71b42f7ca342d` @ `3570734`
- Imported by: opencode
- Imported at: 2026-08-14
