# PLAN-002-wip-plan: WIP 中短期开发计划

## Status

draft (imported)

## Design

- Design:

## Scope and Milestones

1. 已完成：Monorepo 基础设施、Recorder（内部 API + 指纹）、HAR Mock 回放、Zustand 状态管理、Fill/Assert 修复、回放自愈 Phase A、安全加固 R1-R7（含 HSTS/CSP 头、WS Token 认证、路径遍历防护、错误脱敏）、路由 UUID 校验、WebSocket 广播数据隔离、测试覆盖率提升
2. 高优先级（安全）：WS 强制认证
3. 中优先级：录制漏记遮罩层点击、前端 WS 消息过滤、context.ts 单例重构、回放步骤实时截图、Docker Compose、executions routes 测试
4. 低优先级：GEMINI.md 重复文档、frontend api.ts 类型去重、network routes 测试、自愈集成测试深度补强

## Dependencies

- 测试状态：shared 17 / agent 41 / server 42 / frontend 19 用例；缺口为 executions、network routes 零覆盖与无 E2E 测试

## Task Breakdown

- Task:

## Verification Strategy

- 待拆分为独立 Task 后按验收标准验证

## Import Metadata (migrated drafts only)

- Source path: `WIP.md`
- Source hash / commit / snapshot: `c8900bc1036ff6eb2c6aa66e2b4f214f12e097b5abbe25572c3ded5dc214150a` @ `3570734`
- Imported by: opencode
- Imported at: 2026-08-14
