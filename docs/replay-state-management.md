# 回放状态管理技术方案

## 架构概述

回放状态管理采用 **Zustand store 为单一实时数据源 + sessionStorage 持久化 + WebSocket 驱动更新** 的架构。

```
┌─────────────┐     WS消息      ┌──────────────────┐
│  Agent/     │ ──────────────→ │  App.tsx         │
│  Server     │  replay:*       │  (全局WS listener)│
│             │  batch-replay:* │                  │
└─────────────┘                 └────────┬─────────┘
                                         │ set()
                                         ▼
                          ┌──────────────────────────┐
                          │  recordingReplayStore    │
                          │  (Zustand, 内存)          │
                          │                          │
                          │  recordingReplays:       │
                          │    { recordingId: entry }│
                          └──────┬───────┬───────────┘
                                 │       │ auto-persist
                            subscribe   subscribe
                                 │       ▼
                                 │  sessionStorage
                                 │  (页面刷新恢复)
                                 ▼
                    ┌────────────────────────────┐
                    │  UI Components (只读)       │
                    │                            │
                    │  project-list.tsx          │
                    │  recordings-list.tsx       │
                    │  recording-detail.tsx      │
                    └────────────────────────────┘
```

## 核心设计决策

### 1. Zustand Store 作为唯一实时数据源

**为什么不用 HTTP 轮询**：HTTP 是静态快照，只在组件 mount 时拉取一次。回放是实时进行的，轮询间隔内状态变化无法反映。

**为什么不用 HTTP + Store 双源**：两套数据源叠加导致双徽章、状态不一致等问题（见 BUG_LOG.md 第 1-5 轮修复）。

### 2. sessionStorage 持久化

**为什么不是 localStorage**：回放状态是会话级别的，关闭浏览器后应自动清除，不需要跨标签页持久保存。

**为什么不用 URL 参数**：状态需要跨页面共享（项目列表 → 录制详情），URL 参数无法覆盖所有场景。

### 3. 逐字段 `??` 合并策略

`setRecordingStatus` 不使用 `{ ...existing, ...status }` 做对象合并，因为：
- `batch-replay:result` 消息可能不携带 `projectId`（或为 `undefined`）
- `replay:done` 消息可能不携带 `executionId`
- spread 合并时 `undefined` 会覆盖已有字段

改用显式逐字段合并：

```typescript
const existing = s.recordingReplays[status.recordingId];
const entry: RecordingReplayStatus = {
  recordingId: status.recordingId,
  status: status.status,
  projectId: status.projectId ?? existing?.projectId,
  error: status.error ?? existing?.error,
  executionId: status.executionId ?? existing?.executionId,
  startedAt: status.startedAt ?? existing?.startedAt ?? Date.now(),
  finishedAt: status.finishedAt ?? (status.status !== 'running' ? Date.now() : existing?.finishedAt),
};
```

### 4. `finishedAt` 字段

用于项目级别状态聚合时按时间排序，取最新完成的回放结果。

- `running` 状态不更新 `finishedAt`（保留上次运行的值或 undefined）
- 非 `running` 状态自动设置 `finishedAt = Date.now()`
- 页面刷新恢复时，`running` 状态超过 30 分钟未更新视为 stale，自动清除

### 5. 项目级别状态聚合

`getProjectReplayStatus` 两步判断：

1. **优先判断 running**：只要项目下有任何录制在运行中，项目显示"回放中"
2. **按时间排序取最新**：所有录制都不在运行时，取 `finishedAt` 最新的结果

```typescript
if (projectReplays.some(r => r.status === 'running')) return 'running';
projectReplays.sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
return projectReplays[0].status;
```

## 数据流

### 单条回放

```
recording-detail.tsx: handleReplay()
  → setReplayStoreStatus({ recordingId, status: 'running', projectId })
  → Zustand store 更新
  → WS 发送 replay:start
  → Agent 执行 steps
  → WS 收到 replay:step → setReplayStoreStatus({ status: 'running' })
  → WS 收到 replay:done → setReplayStoreStatus({ status: 'passed'|'failed' })
  → auto-persist 写入 sessionStorage
```

### 批量回放

```
recordings-list.tsx: handleBatchReplaySelected()
  → batchReplayRecordings API
  → Server 发送 batch-replay:result (status: 'running')
  → App.tsx 全局 WS listener → setRecordingStatus({ status: 'running' })
  → Agent 执行 → WS 收到 replay:step / replay:done
  → recording-detail.tsx 的 handleWsMessage → setReplayStoreStatus
  → auto-persist 写入 sessionStorage
```

### 页面刷新恢复

```
App.tsx mount
  → connect() WebSocket
  → useRecordingReplayStore.getState().hydrate()
  → loadAllRecordingReplayStates() 扫描 sessionStorage
  → 过滤 stale 条目 (running 超过 30 分钟)
  → set({ recordingReplays: states })
  → 组件通过 selector 读到最新状态
```

## 关键文件

| 文件 | 职责 |
|------|------|
| `store/recording-replay-store.ts` | Zustand store，状态合并、持久化订阅 |
| `lib/recording-replay-storage.ts` | sessionStorage 读写、stale 过滤 |
| `components/project-list.tsx` | 项目级状态聚合（getProjectReplayStatus） |
| `components/recordings-list.tsx` | 录制级状态展示（ReplayStatusIndicator） |
| `components/recording-detail.tsx` | 单条回放状态写入、WS 消息处理 |
| `App.tsx` | 全局 WS listener、batch-replay:result 处理 |

## 已知限制

1. **30 分钟 stale 阈值**：硬编码在 `recording-replay-storage.ts`，如果回放超过 30 分钟未更新（极端情况），状态会被清除
2. **sessionStorage 限制**：每个标签页独立的 sessionStorage，同一录制在不同标签页回放，状态不共享
3. **批量回放跨标签页**：全局 WS listener 在 App.tsx 注册，所有标签页都会收到消息并更新各自 store
