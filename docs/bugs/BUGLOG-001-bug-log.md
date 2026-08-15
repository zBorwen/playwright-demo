# BUGLOG-001-bug-log: Bug 修复记录（历史汇总）

## Status

draft (imported)

## Bug

- Bug:

## Knowledge Promotion

- Derived chain: `BUGLOG-001 → NOTE-002-env-file-management → RULE-001-env-file-management`
- Abstracted to DevNote: `docs/devnotes/NOTE-002-env-file-management.md`（.env 文件生命周期管理）

## Reproduction

- 见来源文档中各条目的「现象」与「根因」小节

## Observed Behavior

- 覆盖的历史问题（部分）：回放完全不生效（前端 WS 断开）、录制内容被覆盖与保存不完整、批量回放状态丢失与二次回放未重置、连续回放状态泄漏、跨页面批量回放状态不同步（迭代 3 次）、项目卡片回放状态显示异常（迭代 5 次）、回放状态泄漏到新录制页面、录制漏记遮罩层点击（待修复）、回放引擎 Strict Mode Violation、批量回放状态隔离、Fill 操作去重（迭代 5 次）、回放状态单一数据源重构、数据回显/回放/Codegen（迭代 3 次）等。

## RootCause

- 未在草稿中逐条断言；来源文档每条含独立根因分析，需逐条审查确认后迁移为正式 Bug/BugLog 记录。

## FixPlan

- 拆分来源文档中的条目为独立 BUG-<seq> 记录并补全 Closure 元数据（fix commit + TestEvidence）

## Evidence

- 来源文档 `BUG_LOG.md`（767 行，含 20+ 条修复记录及「最近提交」）

## Closure

- Fix commit: （待逐条迁移后补全）
- TestEvidence: （待补全）
- Closed at: （待补全）

## Import Metadata (migrated drafts only)

- Source path: `BUG_LOG.md`
- Source hash / commit / snapshot: `01df96d19f0d631ec6a2d49e68c2aaedf007607bebf33c4b26d71b42f7ca342d` @ `3570734`
- Imported by: opencode
- Imported at: 2026-08-14
