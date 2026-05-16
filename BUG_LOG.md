# Bug 修复记录

## 连续回放状态泄漏（2026-05-16）

### 现象
连续点击同一个录制的回放按钮：
1. 第一次执行正常显示步骤进度和状态变化（运行中 → 通过/失败）
2. 第二次开始步骤直接显示已完成，但 agent 实际还没执行完
3. 第三次开始回放按钮一直显示"运行中"，状态不再更新

### 根因
三个问题叠加：

1. **`replayExecutionIdRef` 异步更新延迟**：`handleReplay` 中 `setReplayExecutionId(null)` 是异步的，`replayExecutionIdRef.current` 依赖 `useEffect` 在下次渲染时才更新。第二次 replay 启动时 ref 中仍残留第一次的 executionId。

2. **旧消息过滤条件误杀新消息**：当新 replay 的 `replay:step` 消息到达时，handler 检查 `stepPayload.executionId !== replayExecutionIdRef.current`。由于 ref 中还是旧 ID，所有新步骤消息都被 `return` 丢弃了。

3. **`singleReplayProgress` Map 未清理**：旧 replay 的进度数据残留在全局 Map 中，`detectRunningExecution` 恢复步骤时会把旧进度应用到新步骤上。

### 修复方案
`handleReplay` 中同步清空 ref 和所有相关状态，不依赖异步 setState：

```typescript
// 同步更新 ref（setState 是 async 的，WS 消息可能立即到达）
replayExecutionIdRef.current = null;
setReplayExecutionId(null);
setReplaySteps([]);
setReplayStoreStatus({ recordingId: id!, status: 'passed' });
clearAllSingleReplayProgress();

// 先拿新 executionId，再同步设置到 ref
const { executionId } = await replayRecording(id!, options);
replayExecutionIdRef.current = executionId;
setReplayExecutionId(executionId);

// 初始化新步骤
setReplayStoreStatus({ recordingId: id!, status: 'running', projectId: recording?.projectId, executionId });
setReplaySteps(actions.map(...));
```

同时新增 `use-websocket.ts` 工具函数：
- `clearSingleReplayProgress(executionId)` — 清除单个执行的进度
- `clearAllSingleReplayProgress()` — 清空全部进度

### 修改文件
- `packages/frontend/src/components/recording-detail.tsx` — 重写 `handleReplay` 状态重置顺序
- `packages/frontend/src/hooks/use-websocket.ts` — 新增 `clearSingleReplayProgress` / `clearAllSingleReplayProgress`

### 教训
- React setState 是异步的，`useEffect` 更新 ref 有延迟。当 ref 用于消息过滤时，必须在事件触发前同步更新
- 全局状态 Map 在操作重复执行时必须清理，否则会泄漏到新操作

---

## 项目卡片回放状态显示异常（迭代 5 次修复，2026-05-11）

### 问题背景

项目列表页的 ProjectCard 需要显示该项目最新的回放状态（running/passed/failed），数据来源是 Zustand store（`recordingReplays`），按 `projectId` 过滤并聚合。

### 第一轮：双徽章 + 完成后不消失

**现象**：批量回放时项目卡片同时显示"运行中"和"回放中"两个徽章，完成后"回放中"不消失直到刷新。

**根因**：ProjectList 同时从 HTTP execution 表和 Zustand store 读取状态，两套数据源叠加显示。

**修复**：统一为 Zustand store 单一数据源，移除 HTTP execution 状态展示。

### 第二轮：实时状态完全不更新

**现象**：去掉 store 后改用 HTTP 数据，回放中状态完全不更新。

**根因**：HTTP 数据是静态快照，只在组件 mount 时拉取一次。回放过程中 `recordings` 数组不变，`execMap` 不更新。

**修复**：回归 Zustand store 作为实时显示的唯一数据源，HTTP 仅用于页面刷新恢复。

### 第三轮：单条录制卡片丢失回放状态

**现象**：单个录制回放时，卡片上没有"回放中"徽章。

**根因**：`ReplayStatusIndicator` 只读 store，但 `recordings-list.tsx` 的 `handleBatchReplaySelected` 设置了 store，而 `recording-detail.tsx` 的 `handleReplay` 没有设置 store。

**修复**：`handleReplay` 增加 `setReplayStoreStatus` 调用。

### 第四轮：store 字段覆盖导致状态丢失

**现象**：批量回放多条，一条完成后项目卡片回放状态消失。

**根因**：`setRecordingStatus` 使用 `{ ...existing, ...status }` 做对象合并。当 `batch-replay:result` 消息不携带 `projectId`（或 `projectId: undefined`）时，`undefined` 会覆盖掉已有的 `projectId`。后续 `replay:done` 也没有 `projectId`，导致 entry 的 `projectId` 丢失，`getProjectReplayStatus` 按 `projectId` 过滤时找不到该 entry。

**修复**：`setRecordingStatus` 改为逐字段 `??` 合并，确保已有字段不会被 `undefined` 覆盖：
```typescript
projectId: status.projectId ?? existing?.projectId,
error: status.error ?? existing?.error,
executionId: status.executionId ?? existing?.executionId,
```

### 第五轮：`running` 状态优先级问题（最终修复）

**现象**：批量回放多条，第一条完成后项目卡片显示"通过"，但另一条还在 running 中。

**根因**：`getProjectReplayStatus` 按 `finishedAt` 降序排序取最新值。当第一条完成时：
- `passed` 的 entry `finishedAt` 被设为当前时间（最新值）
- `running` 的 entry `finishedAt` 保留了上轮运行的旧值（较旧）

排序后 `passed` 排在前面，项目卡片显示"通过"，但实际还有另一条在运行中。

**修复**：`getProjectReplayStatus` 改为两步判断：
1. 先检查是否有任何 `running` 的 entry，有则直接返回 `'running'`
2. 否则才按 `finishedAt` 降序取最新结果

```typescript
if (projectReplays.some(r => r.status === 'running')) return 'running';
projectReplays.sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
return projectReplays[0].status;
```

### 教训
- 对象 spread 合并时 `undefined` 值会覆盖已有字段，必须用显式逐字段 `??` 合并
- 状态聚合函数的排序逻辑要考虑所有状态的语义优先级，不能仅依赖时间戳
- 调试数据流时加 console.log 比推测更有效：store 写入 → WS 消息 → 组件渲染三层分别打日志
- 修 bug 不要只改一处，要看完整数据链路：写入端 → 存储层 → 读取端 → 聚合逻辑 → UI 渲染

---

## 回放状态泄漏到新录制页面（2026-05-07）

### 现象
回放录制 A 结束后，进入录制 B 的页面（或新建录制后进入），回放按钮显示"通过"/"失败"等旧状态，而不是默认"回放"。

### 根因
两个问题叠加：
1. `App.tsx` 中 `/recordings/:id` 路由写为 `<RecordingDetail />`，没有 `key`。React Router 在录制 ID 切换时复用同一组件实例。
2. WS handler 的 `replay:step` 和 `replay:done` 消息只按 `executionId` 过滤，初次挂载时 `replayExecutionIdRef.current` 为 null，过滤条件短路，收到其他录制的回放消息直接处理，污染了状态。

### 修复方案
1. 路由改为 `<RecordingDetailWithKey key={id} />`，ID 变化时组件完全重新挂载。
2. `replay:step` 和 `replay:done` handler 增加 `recordingId` 过滤，不匹配当前录制的直接 return。
3. agent 端 `replay:done` 消息携带 `recordingId` 字段。

**修复文件**：`packages/frontend/src/App.tsx`、`packages/frontend/src/components/recording-detail.tsx`、`packages/agent/src/index.ts`、`packages/shared/src/types/actions.ts`

---

## 录制漏记遮罩层点击（2026-05-07）待修复

### 现象
录制时点击对话框遮罩层（`.fixed.inset-0`）关闭对话框，Recorder 完全没有记录这个操作。生成的 codegen 和 actions 中缺少该步骤，导致回放时对话框保持打开，后续同名按钮点击触发 strict mode violation。

### 根因
Playwright Recorder 的 `api` 模式（`_enableRecorder` + `eventSink`）对无交互属性的纯 `div` 元素不敏感。遮罩层点击（如 `.fixed.inset-0`）是关闭对话框的关键操作，但 Recorder 的 `actionAdded` 和 `actionUpdated` 回调都没有触发——日志里完全没有遮罩层点击的记录。

### 实际影响
日志验证：用户执行了 13 步操作（包含 2 次遮罩层点击），但 Recorder 只记录了 11 步，遮罩层点击全部丢失。

### 根因源码分析

Playwright Recorder 内部通过 `recorderMode` 参数选择两套不同的 action 采集工具：

```
// node_modules/playwright-core/lib/generated/pollingRecorderSource.js
"recording": options.recorderMode === "api"
    ? new JsonRecordActionTool(this)
    : new RecordActionTool(this)
```

| 模式 | 使用的工具 | 能力 |
|------|-----------|------|
| `default` | `RecordActionTool` | 有 `onMouseMove` + `_hoveredElement` + `_updateModelForHoveredElement`，鼠标移动时实时生成并预览 selector |
| `api` | `JsonRecordActionTool` | 只有 `onClick` / `onInput` / `onKeyDown` / `onContextMenu`，**没有 hover 追踪** |

`JsonRecordActionTool` 的 `onClick` 直接对 `event.target` 调用 `_ariaSnapshot(element)` → `generateSelector(element)`。对于纯 `div` 元素（如 `.fixed.inset-0`），`generateSelector` 很难生成可靠的 selector，可能返回空或不可靠的结果，导致 action 被静默丢弃。

default 模式下，鼠标在遮罩层上移动时，`RecordActionTool` 的 hover 追踪机制有时间反复尝试生成 selector，视觉上表现为"selector 逐渐识别到"的延迟过程。

### 结论
API 模式天生缺少 hover-based selector resolution 机制，对无交互属性的纯 div 元素不敏感是架构层面的限制。

### 修复方向
在 Recorder 之外注入页面脚本，监听所有 `click` 事件，对比 Recorder 发出的 action，补录被遗漏的点击（无 selector 或纯 div 上的点击）。

---

## 回放引擎 Strict Mode Violation（2026-05-05）

### 现象
录制时用户点击页面上第一个"添加剧本"按钮，录制生成的 selector 为：
```
button >> internal:has-text=/^添加剧本$/
```
但页面上有多个同名按钮，回放时 `page.locator(selector).click()` 触发 strict mode violation 报错。

### 根因
Playwright Recorder 录制时知道用户点了哪个具体按钮，但生成的 selector（带 `has-text` 正则过滤）在回放时可能匹配多个元素。Playwright 的 `locator()` 在 strict mode 下要求 selector 必须唯一匹配，否则抛错。

录制中第二个同名点击的 selector 自带了 `>> nth=0` 消歧，但第一个没有。

### 修复方案
在回放引擎的 `executeAction` 中新增 `withStrictModeFallback<T>()` helper，所有 locator 操作都包裹此方法。当捕获到 strict mode violation 时，fallback 到 `.first()` 操作第一个匹配元素。

**修改文件**：
- `packages/agent/src/replay-engine.ts` — 新增 `withStrictModeFallback` 方法，所有 10 个 locator 操作改用此方法
- `packages/shared/src/types/actions.ts` — `replay:step` payload 增加 `recordingId` 字段（配合单回放进度追踪）

### 教训
Recorder 生成的 selector 不一定在回放时保持唯一性。回放引擎应对 strict mode violation 做宽容处理，用 `.first()` fallback。

---

## 批量回放状态隔离（2026-05-05）

### 问题背景
批量回放状态下，三个页面的状态管理混乱：React 组件各自维护 local state + sessionStorage 全局共享 + WS listener 互相干扰。

### 根本原因
没有单一数据源。每个组件既是 writer 又是 reader，WS 全局广播但各组件无过滤地消费。

### 修复方案
将批量回放状态管理统一到 Zustand store，组件只读，store 唯一写入点。sessionStorage 仅用于页面刷新后的 hydration。

### 涉及文件
- `src/store/batch-replay-store.ts` — 新增
- `src/hooks/use-websocket.ts` — 导出 connect 和 subscribeToMessages
- `src/App.tsx` — 全局 WS listener 注册 + store hydration
- `src/components/project-list.tsx` — 移除 local state，改用 store selector
- `src/components/project-detail.tsx` — 移除 local state，改用 store selector
- `src/components/recordings-list.tsx` — 移除 local state，改用 store selector
- `src/components/recording-detail.tsx` — 移除 local state，改用 store selector

---

### Bug 1: 跨项目批量回放后，项目详情页无状态显示

**现象**：从 `/projects` 触发跨项目批量回放，进入 `/projects/:id` 页面，没有任何执行状态显示。

**根因**：ProjectDetail 只查找 `scope === 'project:${id}'` 的批次，但跨项目批次的 scope 是 `'cross-project'`，`projectIds` 字段包含当前 id。

**修复**：selector 增加对 `cross-project` scope 的检查。

```typescript
b.scope === `project:${id}` || (b.scope === 'cross-project' && b.projectIds?.includes(id))
```

**修复文件**：`src/components/project-detail.tsx`、`src/components/recordings-list.tsx`

**教训**：跨 scope 状态查找要考虑所有可能的来源，不能只看一种 scope 匹配。

---

### Bug 2: 录制详情页不需要显示批量回放进度面板

**现象**：进入单个录制的详情页，同时显示了单个回放面板和批量回放面板，不合理。

**修复**：删除 `recording-detail.tsx` 中所有批量回放相关代码。

**教训**：录制详情页只关注单个回放，批量回放面板应该在列表页展示。

---

### Bug 3: 批量回放时录制状态未隔离，跨录制互相干扰

**现象**：批量回放录制 A 和 B，执行 A 到 step 7 时进入 B 的详情页，B 也显示执行到 step 7。

**根因**：两个层面的状态混在一起：

1. **全局 progress map 的 key 设计**：`singleReplayProgress` 用 `recordingId` 做 key，批量回放时多个录制有各自独立的执行流但共享同一个 key。
2. **WS handler 无过滤**：`handleWsMessage` 处理所有 `replay:step` 消息，不检查是否属于当前录制的 executionId，按 index 直接匹配更新。

**修复 1**：`use-websocket.ts` — 改用 `executionId` 做 key，每次回放天然隔离。

**修复 2**：`recording-detail.tsx` — 在 `replay:step` 和 `replay:done` handler 中加入 `executionId` 过滤，用 ref 保持最新值避免闭包陷阱。

**教训**：
- 全局状态追踪器的 key 设计必须考虑并发场景
- WS 全局广播的消息处理必须过滤，不属于自己的直接 return
- React useCallback 会捕获闭包内的 state，需要用 ref 同步才能获取最新值

---

### Bug 4: 录制详情页进入中途回放时步骤 1-N 缺失

**现象**：回放进行中进入录制详情页，timeline 的步骤 1-6 永远灰色，从第 7 步开始变绿。

**根因**：`detectRunningExecution` 恢复的 steps 全部设为 `pending`。WS `replay:step` 消息只能更新进入页面之后的步骤，无法回填已完成的步骤。

**修复**：
1. agent 端 `replay:step` payload 加入 `recordingId` 字段
2. 前端 WS hook 维护全局 `singleReplayProgress` map
3. RecordingDetail 恢复 state 时读取 map，回填已完成步骤

**修复文件**：`packages/agent/src/index.ts`、`src/hooks/use-websocket.ts`、`src/components/recording-detail.tsx`

---

### Bug 5: Zustand selector 导致无限重渲染

**现象**：Maximum call stack size exceeded

**根因**：`useBatchReplayStore(s => Object.values(s.batches).filter(...))` 每次调用都返回新数组引用，Zustand 检测到变化 → 重渲染 → 重新执行 selector → 无限循环。

**修复**：selector 只返回稳定的 `s.batches` 引用，在组件内用 `useMemo` 做过滤。

```typescript
// 正确做法
const batches = useBatchReplayStore(s => s.batches);
const activeBatches = useMemo(
  () => Object.values(batches).filter(b => b.isRunning && b.items.some(...)),
  [batches, id],
);
```

**教训**：Zustand selector 中不能使用 `.filter()` / `.map()` 返回新对象，应该直接返回 store 的引用。需要派生计算时，selector 返回 `s.batches`，在组件内用 useMemo 做过滤。

---

## Fill 操作去重（迭代 5 次修复）

### 第一轮：值截断问题 (a49145e)

**现象**：fill 操作只保存了第一个字符，后续输入丢失。

**根因**：`actionUpdated` 回调只更新了 codegen 行，忽略了 `data` 参数中的累积文本。

**修复**：在 `actionUpdated` 中检查最后一个 action，更新其 `value` 字段为累积文本。

---

### 第二轮：每次按键都产生记录 (b077904)

**现象**：输入 "playwright" 产生 11 条 Fill 记录。

**根因**：每次按键都作为独立 action 追加到数组。

**修复**：`actionAdded` 跳过 fill 操作，`actionUpdated` 按 selector 查找/更新，最终只保留一条完整记录。

---

### 第三轮：双重去重防护 (1679787)

**现象**：`handleRecorderAction` 路径的 fill 仍然会重复，`actionUpdated` 用 `findIndex` 匹配到的是最早的同 selector 记录而非最新的。

**修复**：
- `handleRecorderAction` 中也增加去重检查
- `findIndex` → `findLastIndex`，匹配最新的同 selector 记录

---

### 第四轮：支持更多操作类型 (d7e8a4b)

**修复**：移除脆弱的 pending state，改为纯数组查找更新。同时新增 5 种操作类型支持：assertText、assertVisible、assertChecked、assertValue、setInputFiles。

---

### 第五轮：去重范围过大 (44525f3)

**现象**：两次独立操作同一 selector（如两个 todo 项），去重逻辑把它们合并成了一条。

**根因**：`findLastIndex` 搜索整个数组，不区分是否属于同一次输入。

**修复**：只检查**最后一个 action** — 如果最后一个 action 是 fill 且同一 selector，则更新；否则创建新的。用 `lastActionName` 跟踪会话边界。前端同样改为 last-action-only 去重。

**教训**：去重应该限定在同一个操作会话内，不能跨会话合并。判断"同一个会话"的方法是检查最后一个动作是否类型相同且 selector 相同。

---

## 回放状态单一数据源重构 (2026-05-07)

### 问题背景

回放状态管理存在两套重叠的系统：
1. `batchReplayStore` — per-batch 模型，追踪批次级别状态
2. `recordingReplayStore` — per-recording 模型，追踪单个录制状态

两套系统追踪同一份数据，导致双写、WS 双重更新、刷新后不同步。方案从 per-batch 切换到 per-recording 时旧代码未删除，两套叠加。

### 根本原因

UI 需求是"每个 recording 卡片显示自己的回放状态"——这是 per-recording 视角，但先实现了 per-batch 模型，后补了 per-recording 模型来满足不同步。

### 修复方案

删除 `batchReplayStore`，`recordingReplayStore` 成为唯一数据源：
- `recordingReplayStore` 新增 `projectId`、`startedAt` 字段，支持 sessionStorage 持久化和 hydration
- 服务端 `batch-replay:result` 消息 payload 新增 `projectId` 字段
- 所有组件从 `recordingReplayStore` 读取和写入，不再双写
- `batch-replay-storage.ts` 改为 recording 级别存储 API

### 衍生 Bug 修复

#### Bug 1: 录制详情页离开时清除批量回放状态

**现象**：批量回放运行时进入录制详情页，返回列表后该录制状态丢失。

**根因**：`recording-detail.tsx` 离开页面时调用 `clearReplayStoreStatus(id)`，不管状态是单个回放还是批量回放设置的。

**修复**：彻底移除卸载清理逻辑，状态完全由 WS 消息驱动更新和最终清理。

#### Bug 2: 录制详情页回放状态与全局不同步

**现象**：批量回放 A、B → 进入 A 详情页 → A 完成 → 进入 B 详情页 → B 的回放按钮仍可点击 → 用户点击发起第二个回放 → 冲突。

**根因**：`replayStatus` 是组件内部 `useState`，mount 时为 `'idle'`，不感知 store 中的 `'running'`。

**修复**：`replayStatus` 改为从 `storeStatus` 派生，组件 mount 时即感知全局状态，按钮显示"回放中"且禁用。移除所有 `setReplayStatus` 调用，状态统一由 store 驱动。

### 涉及文件
- `packages/frontend/src/store/batch-replay-store.ts` — **删除**
- `packages/frontend/src/store/recording-replay-store.ts` — 增强：hydrate + auto-persist
- `packages/frontend/src/lib/batch-replay-storage.ts` — 改为 recording 级别 API
- `packages/frontend/src/App.tsx` — WS listener 只更新一个 store，移除死代码
- `packages/frontend/src/components/project-list.tsx` — 移除 useBatchReplayStore
- `packages/frontend/src/components/project-detail.tsx` — 移除 useBatchReplayStore
- `packages/frontend/src/components/recordings-list.tsx` — 移除 useBatchReplayStore
- `packages/frontend/src/components/recording-detail.tsx` — replayStatus 从 store 派生
- `packages/server/src/routes/recordings.ts` — batch-replay:result 带上 projectId
- `packages/server/src/ws-handlers.ts` — 同上

### 教训
- 方案切换时旧代码必须彻底清理，不能叠加
- 组件内部状态与全局 store 不一致时，应从 store 派生而非各自维护
- 页面卸载时清理状态要区分"主动发起"和"被动接收"，否则会清理掉别人的状态

---

## 数据回显、回放、Codegen（迭代 3 次修复）

### 第一轮：三个问题 (77787fd)

**Bug 1 — 数据不展示**：WS handler 存储 actions 为裸数组 `[...]`，HTTP 存储为 `{actions: [...]}`，读取时格式不兼容。

**修复**：统一存储格式为 `{recordingId, actions}`，GET 接口增加向后兼容和 `ORDER BY createdAt DESC`。

**Bug 2 — 回放无浏览器**：replay-engine 默认 `headless: true`，回放在后台运行看不到浏览器。

**修复**：默认改为 `headless: false`。

**Bug 3 — Codegen 非实时**：`record:action` 消息没有 `code` 字段。

**修复**：`onAction` 回调增加 `code` 参数，WS payload 同步携带，前端实时累积。

---

### 第二轮：Timeline 信息不全 (a2c11d0)

**现象**：Timeline 只显示 action name 和原始 selector，缺少值、角色等详情。

**修复**：
- 统一用 `RecordingAction` 类型（含 elementInfo/pageContext）
- 新增 `formatActionDetail()` 按操作类型展示不同字段（selector、value、key、role 等）
- 新增 `GET /:id/codegen` 服务端接口
- JSON 编辑器接收完整 `RecordingAction[]`
- 清理死代码文件

---

### 第三轮：Zod 数据丢失 (e988a74)

**现象**：POST /:id/actions 保存的 actions 只有 `name` 字段，selector、value、elementInfo 全部丢失。

**根因**：Zod validator 用了 `z.object({name: z.string()})` 但没有 `.passthrough()`，Zod 丢弃了所有未声明的字段。

**修复**：schema 加 `.passthrough()`。codegen 服务增加安全默认值防御 `undefined` 字段。Timeline 缺 timestamp 时显示 `'--:--:--'`。

**教训**：Zod schema 必须加 `.passthrough()` 或完整声明所有字段，否则未声明的字段会被静默丢弃。

---

## 回放状态/错误/进度 (037c955 + e1b2fbb)

### 第一轮：状态不更新 + 无错误信息 + 无进度展示

**根因**：
1. agent 的 `replay:done` 没有携带 `executionId`，server 无法更新对应 DB 记录
2. server WS handler 不处理 `replay:step` / `replay:screenshot` 消息
3. `replay:step` 只有 `{index, status: 'running'}`，无成功/失败区分

**修复**：agent 所有 replay 消息携带 `executionId`。server 新增 step/screenshot 转发 + done 时更新 DB（status、error、trace、finishedAt）。

---

### 第二轮：回放面板 WS 消息驱动

**现象**：ReplayPanel 轮询 `fetchExecution` 获取最终状态，但步骤管理在本地，失败步骤无错误信息。

**修复**：
- agent `onStep` 改为发送 `status: 'completed'`（不是 'running'）
- 新增 `onStepFailed` 回调，携带错误信息
- 前端 ReplayPanel 完全由 WS 消息驱动，步骤显示 completed/failed/skipped 状态
- 失败步骤展示红色错误信息块

---

## 回放引擎重写 (4ae4eb1)

**现象**：回放引擎使用 `page.$()` + 手动 null 检查，没有 auto-wait，DOM 未加载完成时元素找不到。

**根因**：使用了 Playwright 旧 API，缺少内置等待机制。

**修复**：全部改用 `page.locator()`，利用内置 auto-wait。`assertVisible` 用 `locator.waitFor({state: 'visible'})`，`assertValue` 用 `locator.inputValue()`。

**教训**：优先使用 Playwright 内置 API（locator），而非低层 `$()` 手动操作。

---

## 录制删除功能 (7241830)

**Bug 1 — 路由顺序**：`DELETE /batch` 定义在 `DELETE /:id` 之后，Hono 把 "batch" 匹配为 `:id` 参数。

**修复**：交换路由顺序，`DELETE /batch` 注册在 `DELETE /:id` 之前。

**Bug 2 — 存储文件泄漏**：`deleteRecording` 只删除 DB 记录，storage 目录下的文件残留。

**修复**：删除时同时 `rm(storageDir, {recursive: true, force: true})`。

**教训**：Hono/Express 等框架中，具体路由必须在参数化路由之前注册。删除操作要同时清理 DB 和文件存储。

---

## API 相关

### 查询 actions 返回 404 (e16bcef)

**现象**：`GET /:id/actions` 在没有 actions 时返回 404，前端显示错误状态。

**修复**：改为返回 `successResponse({ actions: [] })`。空结果是合法的，不应返回 404。

---

### 新建录制未校验项目存在性 (069217e)

**现象**：`POST /recordings` 传入不存在的 projectId，触发外键约束错误。

**修复**：插入前 `SELECT id FROM projects WHERE id = ?`，不存在返回 404 "项目不存在"。

---

### POST /actions 覆盖时删除 HAR 文件 (f86ddcd)

**现象**：`POST /:id/actions` 执行 `DELETE FROM artifacts WHERE recordingId = ?`，把刚插入的 HAR 文件也删了。

**修复**：改为 `DELETE FROM artifacts WHERE recordingId = ? AND type = 'actions'`，只删除 actions 类型的 artifact。

**教训**：DELETE 操作必须限定 type/条件，不能无差别删除同 recordingId 的所有 artifact。

---

## 前端/UX

### 项目创建后全页刷新 (7a70329)

**现象**：创建项目后 `window.location.reload()`，页面闪烁。

**修复**：用 `reloadKey` prop + `useEffect` 触发重新拉取，避免全页刷新。表单支持 Escape 关闭、点击背景关闭。

---

### 卡片点击区域过小 (610c84e)

**现象**：只有卡片的文字区域可点击，空白区域无法点击。删除按钮内联显示，视觉杂乱。

**修复**：Link 包裹整个卡片内容。删除按钮移到右上角，`opacity-0` + `group-hover:opacity-100` 悬停显示。checkbox 和删除按钮加 `stopPropagation()` 防止冒泡。

---

### ACTION_ICONS 缺少 click (512a681)

**修复**：添加 `click: '👆'` 到图标映射。

---

## 录制/连接

### WebSocket 连接不稳定 (19e65a9)

**现象**：Vite 的 `/ws` 代理连接不稳定，前端频繁断连。

**修复**：移除 Vite WS 代理配置，前端直连后端 `ws://localhost:3000/ws`（通过 `VITE_WS_URL` 环境变量配置）。

---

### Agent 未注册 agentId (938748d)

**现象**：Agent WebSocket 连接没有 `agentId` 参数，server 无法识别是哪个 agent。

**修复**：连接 URL 追加 `?agentId=<AGENT_ID>`。

---

### 新建录制加载失败 (5b08baa)

**现象**：新建录制没有 actions，`fetchRecordingActions` 返回 404（已在上面修复），`Promise.all` 整体 reject，页面卡在加载中。

**修复**：`.catch(() => ({ actions: [] }))` 捕获 404 返回空数组。

---

### Playwright 工具栏遮挡 (f451f87)

**修复**：`ProgrammaticRecorderApp` 加 `hideToolbar: true`。

---

### 录制器无内容 (d202188)

**根因**：多个初始化顺序问题：
1. `page.goto()` 在 `page.addInitScript()` 之前调用，事件收集脚本未注入
2. navigate 事件用页面 URL 当 CSS selector，`captureFingerprint` 失败
3. `getBoundingClientRect` 在 detached 元素上报错

**修复**：
- 正确顺序：`exposeFunction` → `addInitScript` → `framenavigated` → `goto`
- navigate 事件跳过 fingerprint，用合成对象
- CSS selector 校验 + `getBoundingClientRect` 存在性检查

**教训**：Playwright 录制必须先注入脚本再导航。fingerprint 采集要防御 detached 元素和无效 selector。

---

## 其他

### 录制时浏览器导航错误处理 (d99977b)

**修复**：增加 try/catch 和重试逻辑，处理导航超时和网络错误。

### TypeScript 编译错误 / 配置清理

多个提交修复了 tsconfig 配置（rootDir、include patterns、废弃字段）、.js 扩展名移除、类型声明补充等。属于基建修复，不单独记录。
