# 录制功能修复总结

## 问题清单

### 1. fill 操作值截断（只保存首字母）
**现象**：用户输入 "playwright"，但 fill action 的 value 只有 "p"

**根因**：
- playwright-core 内部 Recorder 对 fill 操作会触发多次 `actionUpdated` 事件，每次携带累积的输入文本
- 我们的 `actionUpdated` handler 忽略了 `data` 参数中的累积文本

**修复**：`actionUpdated` 中用 `action.text` 更新 fill action 的 value 字段

**文件**：`packages/agent/src/recorder-manager.ts`

---

### 2. fill 操作在 timeline 显示多条（每次按键一条）
**现象**：输入 "playwright" 时 timeline 显示 11 条 Fill 记录

**根因**：
- 后端 `actionAdded` 对 fill 直接跳过，导致首次按键无动作
- `actionUpdated` 每次调用都创建/更新 action 并推送给前端
- 前端 `handleWsMessage` 无脑追加，不合并

**修复**：
- 后端：`actionAdded` 不再跳过 fill，`handleRecorderAction` 内部按 selector 去重
- 前端：用 `actionsRef` 同步追踪 actions 状态，fill 操作按 selector 原地更新
- 新录制开始时清空旧 actions 和 codegen

**文件**：
- `packages/agent/src/recorder-manager.ts`
- `packages/frontend/src/components/recording-detail.tsx`

---

### 3. 相同 selector 的两次 fill 被合并（顺序错乱）
**现象**：先输入 "playwright" 提交，再输入 "test" 提交，但最终只有一条 fill 且值为 "test"

**根因**：去重逻辑用 `findLastIndex` 在整个数组中搜索相同 selector 的 fill，导致第二次输入覆盖了第一次

**修复**：只合并**连续**的 fill（最后一个 action 也是同 selector 的 fill），非连续的同 selector fill 视为新的输入会话

**文件**：
- `packages/agent/src/recorder-manager.ts`
- `packages/frontend/src/components/recording-detail.tsx`

---

### 4. assert 操作未录制
**现象**：在 playwright 浏览器中选择 AssertText/AssertValue 等操作，timeline 和 codegen 中没有对应记录

**根因**：switch 中缺少 `assertText`、`assertVisible`、`assertChecked`、`assertValue`、`setInputFiles` 五种 action 类型的转换

**修复**：补充五种 action 类型的转换逻辑

**文件**：`packages/agent/src/recorder-manager.ts`

---

### 5. Codegen API 500 错误
**现象**：`/api/recordings/:id/codegen` 返回 `TypeError: Cannot read properties of undefined (reading 'substring')`

**根因**：`toActionInContext` 未提供 playwright-core codegen 所需的默认字段值

**修复**：为所有字段提供安全默认值

**文件**：`packages/server/src/services/codegen.ts`

---

### 6. Zod 过滤导致只保存 `{name}` 字段
**现象**：保存到数据库的 action 只有 name 字段

**根因**：Zod 默认行为是 strip unknown fields

**修复**：validator 添加 `.passthrough()`

**文件**：`packages/server/src/routes/recordings.ts`

---

## 技术要点

### playwright-core Recorder 事件流

```
用户交互 → pollingRecorderSource (注入脚本) → __pw_recorderRecordAction
→ server Recorder → context.emit(RecorderEvent) → client eventSink
```

`eventSink` 接收三种事件：
- `actionAdded(page, data, code)` — 新动作
- `actionUpdated(page, data, code)` — 动作更新（fill 累积文本、双击等）
- `signalAdded(page, data)` — 导航等信号

### fill 去重逻辑

```
actionAdded(fill) → handleRecorderAction → push 新 fill
actionUpdated(fill) → 检查最后一个 action 是否同 selector 的 fill
  → 是：更新 value
  → 否：创建新 fill（新的输入会话）
```

### WebSocket 实时推送

```
Agent.onAction → ws.send(record:action) → Server.broadcastToClients → Frontend.handleWsMessage
```

前端用 `actionsRef` 同步追踪最新 state，避免 React 批量更新导致的时序问题。
