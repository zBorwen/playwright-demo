# DESIGN-001-frontend-state-management: 前端状态管理架构设计

## Status

draft (imported)

## Spec

- Spec:

## Proposed Design

本文档描述 Playwright-Demo 前端基于 Zustand 和 WebSocket 的状态管理架构，核心为**"领域划分 + 细粒度订阅 + 纯函数更新"**模式，解决高频实时事件（录制动作推送、回放步骤推送）导致的 Re-render Hell。

- **核心 Store 划分**：按业务边界拆分独立 Store。`useAppStore` 管理低频业务数据（项目列表、加载/错误状态）；`useRecordingReplayStore` 管理强实时业务（多实例并发回放状态、录制动作流、codegen 流、时序竞态缓存）。
- **状态范式化**：摒弃嵌套数组，全面采用以 `id` 为键的字典结构（Record/Map），支持批量并发回放与 O(1) 查找。
- **Immer 中间件**：所有 `set` 操作由 Immer 代理生成 Immutable 快照，简化深层属性更新。
- **影子缓冲队列（Shadow Buffers）**：解决 WebSocket 消息早于组件挂载的时序竞态；通过 `executionId` 识别新并发任务并重置状态。
- **组件解耦**：WS `onMessage` 提取到 `useRecordingWebSocket` Hook；子组件用 `useShallow` 细粒度订阅；渲染数据源保证 O(1) 下标访问，避免 O(N²) 陷阱。
- **会话持久化**：通过 `subscribe` 将非 idle 活跃状态保存至 `sessionStorage`，页面重载时 `hydrate()` 恢复骨架。

## Interfaces and Boundaries

- `store/recording-replay-store.ts`（Zustand store 与持久化订阅）
- `lib/recording-replay-storage.ts`（sessionStorage 读写）
- `components/project-list.tsx` / `recordings-list.tsx` / `recording-detail.tsx`（只读消费方）
- `App.tsx`（全局 WS listener）
- WebSocket 消息协议：`replay:step` / `replay:done` / `replay:start` / `batch-replay:result` / `record:action`

## Alternatives

- Option: 单一全局巨石 Store
- Rejected because: 高频消息导致全树重渲染，性能不可接受

## Tradeoffs and Risks

- sessionStorage 按标签页隔离，同一录制多标签页回放状态不共享
- 30 分钟 stale 阈值硬编码，极端长回放可能被误清除

## Links

- Plan:

## Import Metadata (migrated drafts only)

- Source path: `docs/frontend-state-management.md`
- Source hash / commit / snapshot: `2588afed0ae5f973d55a75d2469a478b5673b1cc9768396b15fc6e154d91d4b0` @ `3570734`
- Imported by: opencode
- Imported at: 2026-08-14
