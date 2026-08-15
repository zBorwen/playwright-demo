# NOTE-001-dev-notes: 开发笔记（历史汇总）

## Status

draft (imported)

## Context

- Source BugLog or Task: DEV_NOTE.md（历史开发笔记）
- Applicable projects or boundaries: playwright-demo 全仓库

## Conclusion

- Recorder 采用 playwright-core 内部 API（`_enableRecorder` + eventSink）捕获完整交互，历史注入 JS 方案因捕获不完整已废弃
- 数据库选型 PostgreSQL + Drizzle ORM；个人单用户场景可降级 SQLite
- WebSocket 消息协议含 Server↔Agent 双向 11 种消息类型，心跳 30s
- 存储结构：`storage/recordings/{id}/`（actions.json + recording.har）、`storage/executions/{id}/`（screenshots + replay.har）
- 环境要求：TypeScript >= 5.7、Node.js 24+（可直接运行 .ts）

## Examples

- 详见来源文档各小节

## Confidence and Review

- Confidence: medium（历史笔记，需人工复核）
- Reviewed by: <required before status becomes reviewed>
- Reviewed at: <required before status becomes reviewed>
- Promoted to:
- Promoted by:
- Promoted at:

## Import Metadata (migrated drafts only)

- Source path: `DEV_NOTE.md`
- Source hash / commit / snapshot: `9477946bbacad3926fd36ac561efefc5c970491c05a2622b7e47cf0ad21d5281` @ `3570734`
- Imported by: opencode
- Imported at: 2026-08-14
