# 前端状态管理架构设计

本文档描述了 Playwright-Demo 项目前端基于 Zustand 和 WebSocket 的状态管理架构。由于系统需要处理大量高频的实时事件（如浏览器的录制动作推送、回放步骤推送等），传统的 React 状态流转容易引发严重的渲染性能问题（Re-render Hell）。因此，本项目采用**“领域划分 + 细粒度订阅 + 纯函数更新”**的架构模式。

## 1. 核心 Store 划分

前端采用领域驱动设计（DDD）的思想，将状态按业务边界拆分为多个独立的 Store，而不是使用单一的全局巨石 Store。

### `useAppStore` (基础业务实体)
负责管理低频变动的基础业务数据：
- 项目列表 (`projects`)
- 加载和错误状态 (`loadingProjects`, `projectError`)
- 这些数据多为直接与 REST API 交互的 CRUD 操作，生命周期较长，适合在顶层或路由层获取。

### `useRecordingReplayStore` (高频流式数据) **【核心】**
专门为“浏览器录制”和“自动化回放”两大强实时业务设计的状态容器。
- 负责管理多实例并发回放状态（`recordingReplays` 字典）。
- 负责管理录制过程中实时产生的动作流（`activeRecordingActions`）和代码流（`activeCodegens`）。
- 负责处理因组件生命周期与 WebSocket 推送不同步而产生的“时序竞态条件”。

## 2. 状态结构范式化 (Normalized State)

为了支持“批量并发回放”以及极简的 O(1) 查找，Store 内部摒弃了深层嵌套的数组，全面采用以 `id` 为键的字典结构（Record/Map）。

```typescript
// 错误示范 (数组嵌套，查找和更新都是 O(N)):
// const store = [{ recordingId: 'A', steps: [...] }, ...]

// 当前范式化设计 (O(1) 访问):
interface RecordingReplayStore {
  // 回放状态字典
  recordingReplays: Record<string, RecordingReplayStatus>;
  
  // 录制流字典
  activeRecordingActions: Record<string, RecordingAction[]>;
  activeCodegens: Record<string, string>;
  
  // 时序竞态缓存队列
  stepStatuses: Record<string, Record<number, 'completed' | 'failed' | 'skipped'>>;
  pendingDones: Record<string, { status: 'passed' | 'failed'; ... }>;
}
```

## 3. Immutable 数据流与 Immer 中间件

在复杂的嵌套结构下更新深层属性（例如修改某一个录制项下某一个步骤的状态），原生的展开运算符（`...`）非常容易出错。
项目中引入了 `immer` 中间件，所有的 `set` 操作被转化为类似变更普通可变对象的纯函数，底层由 Immer 自动代理并生成 Immutable 快照：

```typescript
// 借助 Immer，深层更新被简化：
handleReplayStep: (payload) => set((state) => {
  const existing = state.recordingReplays[payload.recordingId];
  if (existing && existing.replaySteps) {
    // 直接赋值即可，Immer 保证了引用的正确更新
    existing.replaySteps[payload.index].status = payload.status;
  }
})
```

## 4. 解决组件生命周期与 WS 的时序竞态

在前端应用中，WebSocket 的连接独立于 React 组件树的渲染。后端推送消息（如 `replay:step` 或 `replay:done`）时，前端负责展示详情的 UI 组件（如 `RecordingDetail`）可能**尚未挂载**或正在挂载中（尚未调用 `initSteps`）。

为了防止状态丢失，Store 采用**影子缓冲队列 (Shadow Buffers)** 模式：
1. **缓存过早的消息**：当 `handleReplayStep` 收到消息，如果发现当前 recordingId 的骨架 (`replaySteps`) 尚未初始化，它会将状态暂存到 `stepStatuses` 队列中。
2. **延迟合并**：当组件挂载完毕并触发 `initSteps` 构建初始步骤序列时，会去读取 `stepStatuses` 和 `pendingDones` 缓存，将其与初始骨架合并，从而追平状态。
3. **识别新任务**：每次接收 WebSocket 消息时，通过比对 `executionId` 来判断这是否是一次全新的并发任务。若是新任务，则主动将之前的步骤全部重置为 `pending`。

## 5. 组件解耦与细粒度渲染隔离

为了彻底解决“录制中输入一个字符导致整个页面卡顿”的问题，系统强行切断了巨石组件与 Store 的直接强关联，采用“容器 - 哑组件 - 局部订阅”的组合模式。

### 5.1 通信层解耦 (自定义 Hook)
原来杂揉在组件中的 WebSocket `onMessage` 回调被提取到专用的 Hook `useRecordingWebSocket` 中。
- **职责单一**：Hook 仅负责接收底层的 Socket Event，并立即映射转换为 Store 的 Dispatch (Action) 调用。
- **防止闭包陷阱**：消灭了使用 `useRef` 去绕过 React 渲染周期来暂存消息的 Hack 写法。

### 5.2 局部按需订阅 (`useShallow`)
顶层的 `RecordingDetail` 仅仅充当布局容器（Layout Container），不再 `useStore(s => s.actions)`。
真正需要消费数据的子组件（如 `StepListPanel`, `CodegenTab`）在内部利用 Zustand 的 `useShallow` 进行细粒度订阅。

```tsx
// ✅ 优秀设计：仅订阅特定的子切片。该步骤状态改变时，只刷新这一个独立组件。
const StepItem = memo(({ recordingId, index }) => {
  const step = useRecordingReplayStore(useShallow(s => 
    s.recordingReplays[recordingId]?.replaySteps?.[index]
  ));
  
  return <div>{step.status}</div>;
});
```

### 5.3 避免 O(N²) 的性能陷阱
在渲染包含成百上千个步骤的列表时，确保渲染的数据源在映射时是 O(1) 的下标访问。避免在 `.map` 循环内部调用 `.find` 或 `.filter` 去另一张表中匹配数据。

## 6. 状态的持久化 (Hydration)

自动回放的过程中可能面临页面刷新。为了保证回放过程的观测不中断：
- Store 通过 `useRecordingReplayStore.subscribe` 监听任何状态树的变更。
- 将非 'idle' 的活跃状态同步保存至 `sessionStorage`。
- 页面重新加载时调用 `hydrate()` 方法恢复暂存的数据骨架，并将其注入 `initSteps` 的初始化流程中。