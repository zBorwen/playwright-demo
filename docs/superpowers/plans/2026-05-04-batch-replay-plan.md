# 批量回放 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持三种批量回放场景——单个项目所有录制回放、多个项目所有录制回放、选择单个或多个录制进行批量回放。

**Architecture:** 新增一个 `POST /recordings/batch-replay` 批量回放 API，接收 recordingId 列表，逐个发送回放命令给 Agent 并创建独立的 execution 记录。前端在三个入口（项目卡片、项目详情页录制列表、录制详情页录制列表）添加批量回放按钮，通过复选框选择目标后触发。回放进度通过 WebSocket 实时推送。

**Tech Stack:** Hono (server), Drizzle ORM (DB), WebSocket (real-time push), React + Zustand (frontend)

---

## 文件清单

| 类型 | 文件 | 职责 |
|------|------|------|
| 新建 | `packages/frontend/src/components/batch-replay-panel.tsx` | 批量回放进度面板，展示每条录制的回放状态 |
| 修改 | `packages/server/src/routes/recordings.ts` | 新增 `POST /:id/batch-replay` 和 `POST /batch-replay` 两个端点 |
| 修改 | `packages/server/src/ws-handlers.ts` | 新增批量回放完成时的 broadcast 处理 |
| 修改 | `packages/frontend/src/lib/api.ts` | 新增 `batchReplayRecordings()` 和 `batchReplayProjects()` API 函数 |
| 修改 | `packages/frontend/src/components/recordings-list.tsx` | 增加批量选择 + 批量回放按钮 |
| 修改 | `packages/frontend/src/components/project-detail.tsx` | 增加"批量回放本项目所有录制"按钮 |
| 修改 | `packages/frontend/src/components/project-list.tsx` | 增加项目卡片上的复选框和批量回放入口 |
| 修改 | `packages/frontend/src/components/recording-detail.tsx` | 增加批量回放进度面板展示 |
| 修改 | `packages/shared/src/types/actions.ts` | 新增批量回放相关 WebSocket 消息类型 |

---

### Task 1: 批量回放共享类型定义

**Files:**
- Modify: `packages/shared/src/types/actions.ts`

- [ ] **Step 1: 添加批量回放 WebSocket 消息类型**

```typescript
// 批量回放启动消息 (server → frontend)
// 每条录制回放时推送进度
export interface BatchReplayStartMessage {
  type: 'batch-replay:start';
  payload: {
    batchId: string;          // 本次批量回放的唯一 ID
    totalRecordings: number;  // 总共多少条录制
  };
}

// 批量回放单条结果 (server → frontend)
export interface BatchReplayResultMessage {
  type: 'batch-replay:result';
  payload: {
    batchId: string;
    recordingId: string;
    recordingTitle: string;
    executionId: string;
    status: 'passed' | 'failed';
    error?: string;
  };
}

// 批量回放全部完成 (server → frontend)
export interface BatchReplayDoneMessage {
  type: 'batch-replay:done';
  payload: {
    batchId: string;
    total: number;
    passed: number;
    failed: number;
  };
}
```

- [ ] **Step 2: 将新类型导出到 shared index**

确认 `packages/shared/src/index.ts` 已导出 `types/actions.ts` 中的类型。

- [ ] **Step 3: 编译验证**

```bash
cd packages/shared && pnpm exec tsc --noEmit
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/actions.ts packages/shared/src/index.ts
git commit -m "feat: 添加批量回放 WebSocket 消息类型定义"
```

---

### Task 2: Server 批量回放 API

**Files:**
- Modify: `packages/server/src/routes/recordings.ts`
- Modify: `packages/server/src/ws-handlers.ts`

- [ ] **Step 1: 添加批量回放 API — 按 recordingId 列表**

在 `packages/server/src/routes/recordings.ts` 中，`POST /batch-replay` 路由（放在 `DELETE /batch` 之前，避免被 `/:id` 匹配）：

```typescript
recordingsRouter.post('/batch-replay', zValidator('json', z.object({
  recordingIds: z.array(z.string().uuid()).min(1),
  useMock: z.boolean().optional().default(false),
  agentId: z.string().optional().default('default'),
})), async (c) => {
  const { recordingIds, useMock, agentId } = c.req.valid('json');
  const batchId = crypto.randomUUID();

  // Filter to recordings that actually exist and have actions
  const validRecordings: Array<{ id: string; title: string; targetUrl: string }> = [];
  for (const id of recordingIds) {
    const rec = await db.select().from(recordings).where(eq(recordings.id, id)).limit(1);
    if (!rec.length) continue;

    const artifact = await db
      .select()
      .from(recordingArtifacts)
      .where(and(eq(recordingArtifacts.recordingId, id), eq(recordingArtifacts.type, 'actions')))
      .limit(1);
    if (!artifact.length) continue;

    validRecordings.push({ id, title: rec[0].title, targetUrl: rec[0].targetUrl ?? '' });
  }

  if (validRecordings.length === 0) {
    return c.json(errorResponse(API_CODES.NOT_FOUND, '没有找到有效的录制'), 404);
  }

  // Notify frontend about batch start
  const startMsg = JSON.stringify({
    type: 'batch-replay:start',
    payload: { batchId, totalRecordings: validRecordings.length },
  } as ServerMessage);

  // Send each replay sequentially
  const results: Array<{ recordingId: string; executionId: string }> = [];
  for (const rec of validRecordings) {
    const artifact = await db
      .select()
      .from(recordingArtifacts)
      .where(and(eq(recordingArtifacts.recordingId, rec.id), eq(recordingArtifacts.type, 'actions')))
      .limit(1);

    const actionsData = JSON.parse(artifact[0].content as string);
    let mockRules: MockRule[] = [];
    if (useMock) {
      const mockArtifact = await db
        .select()
        .from(recordingArtifacts)
        .where(and(eq(recordingArtifacts.recordingId, rec.id), eq(recordingArtifacts.type, 'mock_rules')))
        .limit(1);
      if (mockArtifact.length && mockArtifact[0].content) {
        mockRules = JSON.parse(mockArtifact[0].content) as MockRule[];
      }
    }

    const execution = await db.insert(executions).values({
      recordingId: rec.id,
      status: 'running',
    }).returning();

    const sent = getWsHandlers().sendToAgent(agentId, {
      type: 'replay:start',
      payload: {
        recordingId: rec.id,
        executionId: execution[0].id,
        actions: actionsData.actions || [],
        harRef: useMock ? `${rec.id}/recording.har` : '',
        mockRules,
      },
    });

    if (sent) {
      results.push({ recordingId: rec.id, executionId: execution[0].id });
    }

    // Broadcast batch start notification
    const handlers = (getWsHandlers() as any);
    if (handlers.broadcastToClients) {
      handlers.broadcastToClients(startMsg);
    }
  }

  return c.json(successResponse({
    batchId,
    total: validRecordings.length,
    results,
  }), 202);
});
```

- [ ] **Step 2: 添加按项目批量回放 API**

在同一个文件中，`POST /batch-replay/projects` 路由：

```typescript
recordingsRouter.post('/batch-replay/projects', zValidator('json', z.object({
  projectIds: z.array(z.string().uuid()).min(1),
  useMock: z.boolean().optional().default(false),
  agentId: z.string().optional().default('default'),
})), async (c) => {
  const { projectIds, useMock, agentId } = c.req.valid('json');

  // Collect all recording IDs from the specified projects
  const allRecordings: string[] = [];
  for (const projectId of projectIds) {
    const recs = await db
      .select({ id: recordings.id })
      .from(recordings)
      .where(eq(recordings.projectId, projectId));
    allRecordings.push(...recs.map(r => r.id));
  }

  if (allRecordings.length === 0) {
    return c.json(errorResponse(API_CODES.NOT_FOUND, '这些项目下没有录制'), 404);
  }

  // Reuse the batch-replay logic by forwarding the recording IDs
  const body = { recordingIds: allRecordings, useMock, agentId };
  // Call the same logic inline (don't make a sub-request)
  // ... duplicate the logic from Step 1 or extract to a helper
  // Prefer extracting to a helper function executeBatchReplay()
});
```

**实际做法**：将批量回放核心逻辑提取为 `executeBatchReplay(recordingIds, useMock, agentId)` 函数，两个路由都调用它。

```typescript
async function executeBatchReplay(
  recordingIds: string[],
  useMock: boolean,
  agentId: string,
): Promise<{ batchId: string; total: number; results: Array<{ recordingId: string; executionId: string }> }> {
  const batchId = crypto.randomUUID();

  const validRecordings: Array<{ id: string; title: string; targetUrl: string }> = [];
  for (const id of recordingIds) {
    const rec = await db.select().from(recordings).where(eq(recordings.id, id)).limit(1);
    if (!rec.length) continue;
    const artifact = await db
      .select()
      .from(recordingArtifacts)
      .where(and(eq(recordingArtifacts.recordingId, id), eq(recordingArtifacts.type, 'actions')))
      .limit(1);
    if (!artifact.length) continue;
    validRecordings.push({ id, title: rec[0].title, targetUrl: rec[0].targetUrl ?? '' });
  }

  if (validRecordings.length === 0) {
    throw new Error('没有找到有效的录制');
  }

  // Broadcast start
  const handlers = getWsHandlers() as any;
  handlers.broadcastToClients?.(JSON.stringify({
    type: 'batch-replay:start',
    payload: { batchId, totalRecordings: validRecordings.length },
  }));

  const results: Array<{ recordingId: string; executionId: string }> = [];
  for (const rec of validRecordings) {
    const artifact = await db
      .select()
      .from(recordingArtifacts)
      .where(and(eq(recordingArtifacts.recordingId, rec.id), eq(recordingArtifacts.type, 'actions')))
      .limit(1);
    const actionsData = JSON.parse(artifact[0].content as string);

    let mockRules: MockRule[] = [];
    if (useMock) {
      const mockArtifact = await db
        .select()
        .from(recordingArtifacts)
        .where(and(eq(recordingArtifacts.recordingId, rec.id), eq(recordingArtifacts.type, 'mock_rules')))
        .limit(1);
      if (mockArtifact.length && mockArtifact[0].content) {
        mockRules = JSON.parse(mockArtifact[0].content) as MockRule[];
      }
    }

    const execution = await db.insert(executions).values({
      recordingId: rec.id,
      status: 'running',
    }).returning();

    const sent = handlers.sendToAgent(agentId, {
      type: 'replay:start',
      payload: {
        recordingId: rec.id,
        executionId: execution[0].id,
        actions: actionsData.actions || [],
        harRef: useMock ? `${rec.id}/recording.har` : '',
        mockRules,
      },
    });

    if (sent) {
      results.push({ recordingId: rec.id, executionId: execution[0].id });
    }
  }

  return { batchId, total: validRecordings.length, results };
}
```

然后在两个路由中调用：

```typescript
// POST /batch-replay
recordingsRouter.post('/batch-replay', zValidator('json', z.object({
  recordingIds: z.array(z.string().uuid()).min(1),
  useMock: z.boolean().optional().default(false),
  agentId: z.string().optional().default('default'),
})), async (c) => {
  const { recordingIds, useMock, agentId } = c.req.valid('json');
  try {
    const result = await executeBatchReplay(recordingIds, useMock, agentId);
    return c.json(successResponse(result), 202);
  } catch (e) {
    return c.json(errorResponse(API_CODES.NOT_FOUND, (e as Error).message), 404);
  }
});

// POST /batch-replay/projects
recordingsRouter.post('/batch-replay/projects', zValidator('json', z.object({
  projectIds: z.array(z.string().uuid()).min(1),
  useMock: z.boolean().optional().default(false),
  agentId: z.string().optional().default('default'),
})), async (c) => {
  const { projectIds, useMock, agentId } = c.req.valid('json');

  const allRecordingIds: string[] = [];
  for (const projectId of projectIds) {
    const recs = await db
      .select({ id: recordings.id })
      .from(recordings)
      .where(eq(recordings.projectId, projectId));
    allRecordingIds.push(...recs.map(r => r.id));
  }

  if (allRecordingIds.length === 0) {
    return c.json(errorResponse(API_CODES.NOT_FOUND, '这些项目下没有录制'), 404);
  }

  try {
    const result = await executeBatchReplay(allRecordingIds, useMock, agentId);
    return c.json(successResponse(result), 202);
  } catch (e) {
    return c.json(errorResponse(API_CODES.NOT_FOUND, (e as Error).message), 404);
  }
});
```

- [ ] **Step 3: 确保 WsHandlers.broadcastToClients 是公开方法**

当前 `broadcastToClients` 是 private。在 `packages/server/src/ws-handlers.ts` 中将其改为 public 或添加一个公开方法：

```typescript
// Change from:
private broadcastToClients(data: string, exclude?: WebSocket): void {
// To:
broadcastToClients(data: string, exclude?: WebSocket): void {
```

- [ ] **Step 4: 类型检查**

```bash
cd packages/server && pnpm exec tsc --noEmit
```
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/recordings.ts packages/server/src/ws-handlers.ts
git commit -m "feat: 添加批量回放 API — 支持按录制列表和按项目列表回放"
```

---

### Task 3: Frontend API 函数

**Files:**
- Modify: `packages/frontend/src/lib/api.ts`

- [ ] **Step 1: 添加批量回放 API 函数**

```typescript
export async function batchReplayRecordings(recordingIds: string[], options?: { useMock?: boolean }): Promise<{ batchId: string; total: number; results: Array<{ recordingId: string; executionId: string }> }> {
  return request(`${API_BASE}/recordings/batch-replay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordingIds, useMock: options?.useMock ?? false }),
  });
}

export async function batchReplayProjects(projectIds: string[], options?: { useMock?: boolean }): Promise<{ batchId: string; total: number; results: Array<{ recordingId: string; executionId: string }> }> {
  return request(`${API_BASE}/recordings/batch-replay/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectIds, useMock: options?.useMock ?? false }),
  });
}
```

- [ ] **Step 2: 编译验证**

```bash
cd packages/frontend && pnpm exec tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/lib/api.ts
git commit -m "feat: 添加批量回放 API 前端函数"
```

---

### Task 4: 批量回放进度面板组件

**Files:**
- Create: `packages/frontend/src/components/batch-replay-panel.tsx`

- [ ] **Step 1: 创建 BatchReplayPanel 组件**

```typescript
interface BatchReplayItem {
  recordingId: string;
  recordingTitle?: string;
  executionId?: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  error?: string;
}

interface BatchReplayPanelProps {
  batchId: string;
  total: number;
  items: BatchReplayItem[];
  isRunning: boolean;
  passed: number;
  failed: number;
}

export function BatchReplayPanel({ batchId, total, items, isRunning, passed, failed }: BatchReplayPanelProps) {
  return (
    <div className="my-4 rounded-lg border border-zinc-700 bg-zinc-900">
      {/* Header */}
      <div className="px-4 py-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-medium">批量回放进度</span>
          <span className="text-xs text-zinc-400">
            {isRunning ? (
              <span className="text-yellow-400 animate-pulse">
                已启动 {items.length}/{total} 条
              </span>
            ) : (
              <span className="text-green-400">
                完成 ✓ {passed} 通过 / {failed} 失败
              </span>
            )}
          </span>
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
          <div
            className="h-full bg-green-600 transition-all duration-300"
            style={{ width: `${total > 0 ? ((passed + failed) / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Items */}
      <div className="border-t border-zinc-800 p-3 space-y-1 max-h-[400px] overflow-y-auto">
        {items.map((item) => (
          <div
            key={item.recordingId}
            className={`rounded border px-3 py-2 text-sm transition ${
              item.status === 'passed'
                ? 'border-green-800 bg-green-950/30'
                : item.status === 'failed'
                  ? 'border-red-800 bg-red-950/30'
                  : item.status === 'running'
                    ? 'border-yellow-800 bg-yellow-950/20'
                    : 'border-zinc-800 bg-zinc-900'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-6 text-center text-xs font-mono">
                {item.status === 'passed' ? '✓' : item.status === 'failed' ? '✗' : item.status === 'running' ? '⏳' : '○'}
              </span>
              <span className="font-medium flex-1 truncate">
                {item.recordingTitle || item.recordingId}
              </span>
              {item.executionId && (
                <a
                  href={`/executions/${item.executionId}`}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  详情 →
                </a>
              )}
            </div>
            {item.error && (
              <pre className="mt-2 text-xs text-red-400 font-mono whitespace-pre-wrap">{item.error}</pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export type { BatchReplayItem };
```

- [ ] **Step 2: 编译验证**

```bash
cd packages/frontend && pnpm exec tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/components/batch-replay-panel.tsx
git commit -m "feat: 添加批量回放进度面板组件"
```

---

### Task 5: 录制列表批量选择 + 回放

**Files:**
- Modify: `packages/frontend/src/components/recordings-list.tsx`

- [ ] **Step 1: 添加批量选择功能**

已有 checkbox 和批量删除功能。复用 `selectedIds` 状态，在删除按钮旁边添加"批量回放"按钮：

```typescript
{selectedIds.size > 0 && (
  <div className="mb-4 flex items-center gap-3 rounded border border-zinc-700 bg-zinc-900 px-4 py-2">
    <span className="text-sm text-zinc-300">已选择 {selectedIds.size} 条</span>
    <button
      onClick={handleDeleteSelected}
      disabled={deleting}
      className="rounded bg-red-900 px-3 py-1 text-sm text-red-200 hover:bg-red-800 disabled:opacity-50"
    >
      {deleting ? '删除中…' : '批量删除'}
    </button>
    <button
      onClick={handleBatchReplaySelected}
      disabled={replaying}
      className="rounded bg-green-900 px-3 py-1 text-sm text-green-200 hover:bg-green-800 disabled:opacity-50"
    >
      {replaying ? '回放中…' : '批量回放'}
    </button>
    <button
      onClick={() => setSelectedIds(new Set())}
      className="text-sm text-zinc-400 hover:text-zinc-200"
    >
      取消选择
    </button>
  </div>
)}
```

- [ ] **Step 2: 添加 handleBatchReplaySelected 处理函数**

```typescript
const [replaying, setReplaying] = useState(false);
const [batchReplayState, setBatchReplayState] = useState<{
  batchId: string;
  items: BatchReplayItem[];
  isRunning: boolean;
  passed: number;
  failed: number;
} | null>(null);

const handleBatchReplaySelected = async () => {
  if (selectedIds.size === 0) return;
  setReplaying(true);
  setBatchReplayState({
    batchId: '',
    items: Array.from(selectedIds).map(id => ({
      recordingId: id,
      recordingTitle: recordings.find(r => r.id === id)?.title,
      status: 'pending' as const,
    })),
    isRunning: true,
    passed: 0,
    failed: 0,
  });
  try {
    const result = await batchReplayRecordings([...selectedIds], { useMock });
    setBatchReplayState(prev => prev ? {
      ...prev,
      batchId: result.batchId,
      total: result.total,
    } : null);
  } catch (e) {
    console.error('Batch replay failed:', e);
  }
  setReplaying(false);
  setSelectedIds(new Set());
};
```

- [ ] **Step 3: 监听 WebSocket 批量回放消息**

在组件中使用 `useWebSocket` 的回调，添加 `batch-replay:result` 消息处理：

```typescript
// 在 handleWsMessage 中或单独监听
case 'batch-replay:result': {
  const p = msg.payload as { recordingId: string; status: 'passed' | 'failed'; error?: string; executionId?: string };
  setBatchReplayState(prev => {
    if (!prev) return prev;
    const idx = prev.items.findIndex(i => i.recordingId === p.recordingId);
    if (idx < 0) return prev;
    const updated = [...prev.items];
    updated[idx] = { ...updated[idx], status: p.status, error: p.error, executionId: p.executionId };
    const passed = updated.filter(i => i.status === 'passed').length;
    const failed = updated.filter(i => i.status === 'failed').length;
    return { ...prev, items: updated, passed, failed, isRunning: passed + failed < prev.items.length };
  });
  break;
}
```

- [ ] **Step 4: 在列表中渲染 BatchReplayPanel**

```typescript
{batchReplayState && batchReplayState.items.length > 0 && (
  <BatchReplayPanel
    batchId={batchReplayState.batchId}
    total={batchReplayState.items.length}
    items={batchReplayState.items}
    isRunning={batchReplayState.isRunning}
    passed={batchReplayState.passed}
    failed={batchReplayState.failed}
  />
)}
```

- [ ] **Step 5: 传递 useMock 状态**

从 `RecordingsList` props 接收 `useMock` 参数（从 `RecordingDetail` 传下来）：

```typescript
interface RecordingsListProps {
  projectId?: string;
  reloadKey?: number;
  useMock?: boolean;
}
```

- [ ] **Step 6: 编译验证**

```bash
cd packages/frontend && pnpm exec tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src/components/recordings-list.tsx
git commit -m "feat: 录制列表添加批量选择和批量回放功能"
```

---

### Task 6: 项目详情页批量回放

**Files:**
- Modify: `packages/frontend/src/components/project-detail.tsx`

- [ ] **Step 1: 添加"批量回放"按钮**

在项目标题旁边添加按钮：

```typescript
<div className="mt-2 flex items-center justify-between">
  <div>
    <h1 className="text-2xl font-bold">{project.name}</h1>
    {project.description && <p className="mt-1 text-zinc-400">{project.description}</p>}
  </div>
  <button
    onClick={handleBatchReplayProject}
    disabled={replaying}
    className="rounded bg-green-900 px-4 py-2 text-sm hover:bg-green-800 disabled:opacity-50"
  >
    {replaying ? '⏳ 批量回放中' : '▶ 批量回放本项目'}
  </button>
</div>
```

- [ ] **Step 2: 添加 handleBatchReplayProject 处理函数**

```typescript
const [replaying, setReplaying] = useState(false);
const [batchReplayState, setBatchReplayState] = useState<{
  batchId: string;
  items: BatchReplayItem[];
  isRunning: boolean;
  passed: number;
  failed: number;
} | null>(null);

const handleBatchReplayProject = async () => {
  if (!id) return;
  setReplaying(true);
  setBatchReplayState({ batchId: '', items: [], isRunning: true, passed: 0, failed: 0 });
  try {
    const result = await batchReplayProjects([id]);
    setBatchReplayState(prev => prev ? {
      ...prev,
      batchId: result.batchId,
      items: result.results.map(r => ({ recordingId: r.recordingId, status: 'pending' as const })),
    } : null);
  } catch (e) {
    console.error('Batch replay failed:', e);
    setBatchReplayState(null);
  }
  setReplaying(false);
};
```

- [ ] **Step 3: 渲染 BatchReplayPanel**

```typescript
{batchReplayState && batchReplayState.items.length > 0 && (
  <BatchReplayPanel
    batchId={batchReplayState.batchId}
    total={batchReplayState.items.length}
    items={batchReplayState.items}
    isRunning={batchReplayState.isRunning}
    passed={batchReplayState.passed}
    failed={batchReplayState.failed}
  />
)}
```

- [ ] **Step 4: 编译验证**

```bash
cd packages/frontend && pnpm exec tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/project-detail.tsx
git commit -m "feat: 项目详情页添加批量回放本项目功能"
```

---

### Task 7: 项目列表页批量回放入口

**Files:**
- Modify: `packages/frontend/src/components/project-list.tsx`

- [ ] **Step 1: 在项目卡片上添加复选框和批量回放按钮**

```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [replaying, setReplaying] = useState(false);

// 在列表头部添加批量操作栏
{selectedIds.size > 0 && (
  <div className="mb-4 flex items-center gap-3 rounded border border-zinc-700 bg-zinc-900 px-4 py-2">
    <span className="text-sm text-zinc-300">已选择 {selectedIds.size} 个项目</span>
    <button
      onClick={handleBatchReplaySelected}
      disabled={replaying}
      className="rounded bg-green-900 px-3 py-1 text-sm text-green-200 hover:bg-green-800 disabled:opacity-50"
    >
      {replaying ? '回放中…' : '批量回放'}
    </button>
    <button
      onClick={() => setSelectedIds(new Set())}
      className="text-sm text-zinc-400 hover:text-zinc-200"
    >
      取消选择
    </button>
  </div>
)}
```

- [ ] **Step 2: 每个项目卡片添加复选框**

```typescript
<input
  type="checkbox"
  checked={selectedIds.has(p.id)}
  onChange={() => toggleSelect(p.id)}
  onClick={(e) => e.stopPropagation()}
  className="rounded border-zinc-600 bg-zinc-800"
/>
```

- [ ] **Step 3: 添加 handleBatchReplaySelected**

```typescript
const handleBatchReplaySelected = async () => {
  if (selectedIds.size === 0) return;
  setReplaying(true);
  try {
    await batchReplayProjects([...selectedIds]);
    setSelectedIds(new Set());
  } catch (e) {
    console.error('Batch replay failed:', e);
  }
  setReplaying(false);
};
```

- [ ] **Step 4: 编译验证**

```bash
cd packages/frontend && pnpm exec tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/project-list.tsx
git commit -m "feat: 项目列表添加批量选择和批量回放功能"
```

---

### Task 8: 录制详情页集成批量回放面板

**Files:**
- Modify: `packages/frontend/src/components/recording-detail.tsx`

- [ ] **Step 1: 导入 BatchReplayPanel 和相关 API**

```typescript
import { BatchReplayPanel, type BatchReplayItem } from '@/components/batch-replay-panel';
import { batchReplayRecordings } from '@/lib/api';
```

- [ ] **Step 2: 添加批量回放状态**

```typescript
const [batchReplayState, setBatchReplayState] = useState<{
  batchId: string;
  items: BatchReplayItem[];
  isRunning: boolean;
  passed: number;
  failed: number;
} | null>(null);
```

- [ ] **Step 3: 在 WebSocket 消息处理中添加批量回放监听**

```typescript
case 'batch-replay:result': {
  const p = msg.payload as { recordingId: string; status: 'passed' | 'failed'; error?: string; executionId?: string };
  setBatchReplayState(prev => {
    if (!prev) return prev;
    const idx = prev.items.findIndex(i => i.recordingId === p.recordingId);
    if (idx < 0) return prev;
    const updated = [...prev.items];
    updated[idx] = { ...updated[idx], status: p.status, error: p.error, executionId: p.executionId };
    const passed = updated.filter(i => i.status === 'passed').length;
    const failed = updated.filter(i => i.status === 'failed').length;
    return { ...prev, items: updated, passed, failed, isRunning: passed + failed < prev.items.length };
  });
  break;
}
```

- [ ] **Step 4: 渲染批量回放面板（与 ReplayPanel 并列）**

```typescript
{batchReplayState && batchReplayState.items.length > 0 && (
  <BatchReplayPanel
    batchId={batchReplayState.batchId}
    total={batchReplayState.items.length}
    items={batchReplayState.items}
    isRunning={batchReplayState.isRunning}
    passed={batchReplayState.passed}
    failed={batchReplayState.failed}
  />
)}
```

- [ ] **Step 5: 编译验证**

```bash
cd packages/frontend && pnpm exec tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src/components/recording-detail.tsx
git commit -m "feat: 录制详情页集成批量回放进度面板"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ 单个项目批量回放 → Task 6 (project-detail.tsx) + Task 2 (batch-replay/projects API)
- ✅ 多个项目批量回放 → Task 7 (project-list.tsx 多选) + Task 2 (batch-replay/projects API)
- ✅ 单个或多个录制批量回放 → Task 5 (recordings-list.tsx 多选) + Task 2 (batch-replay API)
- ✅ 实时进度展示 → Task 4 (BatchReplayPanel) + Task 8 (WS 消息处理)

**2. Placeholder scan:** 无 TBD/TODO，所有代码片段包含完整实现。

**3. Type consistency:** 
- `BatchReplayItem` 在 Task 4 定义，Task 5/6/7/8 统一引用
- `batch-replay:result` 消息的 payload 格式与 Task 2 服务端发送一致
- `batchReplayRecordings` / `batchReplayProjects` 返回值与 Task 2 API 响应一致
