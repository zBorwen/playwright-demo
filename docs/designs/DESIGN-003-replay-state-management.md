# DESIGN-003-replay-state-management: 回放状态管理技术方案

## Status

draft (imported)

## Spec

- Spec:

## Proposed Design

本文档描述回放状态管理方案：**Zustand store 为单一实时数据源 + sessionStorage 持久化 + WebSocket 驱动更新**。

- **单一数据源**：`recordingReplayStore` 是唯一实时状态源，UI 组件只读订阅；拒绝 HTTP 轮询与 HTTP+Store 双源（双源导致状态不一致，见 BUG_LOG 1-5 轮修复）。
- **sessionStorage 而非 localStorage**：回放状态为会话级，关闭浏览器自动清除，且支持跨页面共享（项目列表 → 录制详情）。
- **逐字段 `??` 合并**：不用 `{ ...existing, ...status }`，因 `batch-replay:result` / `replay:done` 可能携带 `undefined` 字段覆盖已有值。
- **`finishedAt` 字段**：用于项目级状态聚合按时间排序；`running` 不更新，非 running 自动写时间戳；刷新恢复时超过 30 分钟未更新的 running 视为 stale 自动清除。
- **项目级聚合**：优先判断 running，否则取 `finishedAt` 最新的结果。
- **刷新恢复**：`App.tsx` mount → connect WS → `hydrate()` → 扫描 sessionStorage → 过滤 stale → 注入 store。

## Interfaces and Boundaries

- `store/recording-replay-store.ts` / `lib/recording-replay-storage.ts`
- `components/project-list.tsx` / `recordings-list.tsx` / `recording-detail.tsx`
- `App.tsx`（全局 WS listener）
- WS 消息：`replay:*` / `batch-replay:*`

## Alternatives

- Option: HTTP 轮询获取回放状态
- Rejected because: 快照式拉取无法反映实时进行中的回放
- Option: localStorage 持久化
- Rejected because: 回放状态是会话级，不应跨浏览器会话保留

## Tradeoffs and Risks

- 30 分钟 stale 阈值硬编码，极端长回放可能被误清除
- sessionStorage 标签页隔离，同录制跨标签页回放状态不共享
- 全局 WS listener 在 App.tsx 注册，所有标签页都会收到消息

## Links

- Plan:

## Import Metadata (migrated drafts only)

- Source path: `docs/replay-state-management.md`
- Source hash / commit / snapshot: `b2e91185a218d261ef0e3baff8194dc2c429cae9742ab6fb7b8722a1a11d6afc` @ `3570734`
- Imported by: opencode
- Imported at: 2026-08-14
