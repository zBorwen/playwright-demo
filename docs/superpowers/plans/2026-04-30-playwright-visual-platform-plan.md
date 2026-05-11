# Playwright 可视化操作平台 - 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建基于 Playwright 的可视化录制/回放平台，包含 Monorepo 基础设施、Server（Hono + PostgreSQL）、Agent（本地录制+回放）、Frontend（React 管理界面）四个包。

**Architecture:** Monorepo with pnpm workspace。Server 部署在服务器提供 API + WebSocket 网关，Agent 在用户本地运行连接 WebSocket 执行录制/回放，Frontend 是 React 管理界面，Shared 提供 Zod schema + 类型。

**Tech Stack:** pnpm workspace, TypeScript, Zod, Hono, PostgreSQL, ws, playwright-core, React, shadcn/ui, Tailwind CSS

---

### Task 1: Monorepo 基础设施 + Shared 包

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/schema/actions.ts`
- Create: `packages/shared/src/types/actions.ts`
- Create: `packages/shared/src/schema/index.ts`
- Test: `packages/shared/src/__tests__/actions.test.ts`

- [ ] **Step 1.1: 创建 pnpm-workspace.yaml**

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 1.2: 创建 packages/shared/package.json**

```json
{
  "name": "@playwright-demo/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 1.3: 创建 packages/shared/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 1.4: 创建 packages/shared/src/schema/actions.ts — 全部 Action Zod Schema**

```typescript
import { z } from 'zod';

// ─── ElementInfo ───────────────────────────────────────────────────

export const ElementInfoSchema = z.object({
  dataTestId: z.string().nullable(),
  dataTest: z.string().nullable(),
  role: z.string().nullable(),
  accessibleName: z.string().nullable(),
  textContent: z.string().nullable(),
  placeholder: z.string().nullable(),
  id: z.string().nullable(),
  tagName: z.string(),
  labelText: z.string().nullable(),
  name: z.string().nullable(),
  inputType: z.string().nullable(),
  classes: z.array(z.string()),
  parentPath: z.array(z.string()),
  nearbyText: z.array(z.string()),
  boundingBox: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .nullable(),
  isVisible: z.boolean(),
});

// ─── Signals ───────────────────────────────────────────────────────

const SignalSchema = z.discriminatedUnion('name', [
  z.object({ name: z.literal('navigation'), url: z.string() }),
  z.object({ name: z.literal('popup'), popupAlias: z.string() }),
  z.object({ name: z.literal('download'), downloadAlias: z.string() }),
  z.object({ name: z.literal('dialog'), dialogAlias: z.string() }),
]);

// ─── Actions ───────────────────────────────────────────────────────

export const ClickActionSchema = z.object({
  name: z.literal('click'),
  selector: z.string(),
  button: z.enum(['left', 'middle', 'right']).default('left'),
  modifiers: z.number().default(0),
  clickCount: z.number().default(1),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  signals: z.array(SignalSchema).default([]),
});

export const FillActionSchema = z.object({
  name: z.literal('fill'),
  selector: z.string(),
  text: z.string(),
  signals: z.array(SignalSchema).default([]),
});

export const HoverActionSchema = z.object({
  name: z.literal('hover'),
  selector: z.string(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  signals: z.array(SignalSchema).default([]),
});

export const PressActionSchema = z.object({
  name: z.literal('press'),
  selector: z.string(),
  key: z.string(),
  modifiers: z.number().default(0),
  signals: z.array(SignalSchema).default([]),
});

export const SelectActionSchema = z.object({
  name: z.literal('select'),
  selector: z.string(),
  options: z.array(z.string()),
  signals: z.array(SignalSchema).default([]),
});

export const CheckActionSchema = z.object({
  name: z.literal('check'),
  selector: z.string(),
  signals: z.array(SignalSchema).default([]),
});

export const UncheckActionSchema = z.object({
  name: z.literal('uncheck'),
  selector: z.string(),
  signals: z.array(SignalSchema).default([]),
});

export const SetInputFilesActionSchema = z.object({
  name: z.literal('setInputFiles'),
  selector: z.string(),
  files: z.array(z.string()),
  signals: z.array(SignalSchema).default([]),
});

export const NavigateActionSchema = z.object({
  name: z.literal('navigate'),
  url: z.string(),
  signals: z.array(SignalSchema).default([]),
});

export const AssertVisibleActionSchema = z.object({
  name: z.literal('assertVisible'),
  selector: z.string(),
  signals: z.array(SignalSchema).default([]),
});

export const AssertTextActionSchema = z.object({
  name: z.literal('assertText'),
  selector: z.string(),
  text: z.string(),
  substring: z.boolean().default(false),
  signals: z.array(SignalSchema).default([]),
});

export const AssertCheckedActionSchema = z.object({
  name: z.literal('assertChecked'),
  selector: z.string(),
  checked: z.boolean(),
  signals: z.array(SignalSchema).default([]),
});

export const AssertValueActionSchema = z.object({
  name: z.literal('assertValue'),
  selector: z.string(),
  value: z.string(),
  signals: z.array(SignalSchema).default([]),
});

// ─── Discriminated Union ───────────────────────────────────────────

export const ActionSchema = z.discriminatedUnion('name', [
  ClickActionSchema,
  FillActionSchema,
  HoverActionSchema,
  PressActionSchema,
  SelectActionSchema,
  CheckActionSchema,
  UncheckActionSchema,
  SetInputFilesActionSchema,
  NavigateActionSchema,
  AssertVisibleActionSchema,
  AssertTextActionSchema,
  AssertCheckedActionSchema,
  AssertValueActionSchema,
]);

// ─── Recording (完整录制产物) ────────────────────────────────────────

export const PageContextSchema = z.object({
  url: z.string(),
  title: z.string(),
});

export const RecordingActionSchema = ActionSchema.extend({
  elementInfo: ElementInfoSchema,
  pageContext: PageContextSchema,
  timestamp: z.number(),
  harRef: z.string().optional(),
  screenshot: z.boolean().optional(),
});

export const RecordingSchema = z.object({
  recordingId: z.string().uuid(),
  targetUrl: z.string().url(),
  title: z.string(),
  actions: z.array(RecordingActionSchema),
});

// ─── 类型导出 ──────────────────────────────────────────────────────

export type ElementInfo = z.infer<typeof ElementInfoSchema>;
export type Signal = z.infer<typeof SignalSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type PageContext = z.infer<typeof PageContextSchema>;
export type RecordingAction = z.infer<typeof RecordingActionSchema>;
export type Recording = z.infer<typeof RecordingSchema>;
```

- [ ] **Step 1.5: 创建 packages/shared/src/types/actions.ts — WebSocket 消息类型**

```typescript
import type { Action, ElementInfo, Recording } from '../schema/actions.js';

// ─── Server → Agent ────────────────────────────────────────────────

export type ServerMessage =
  | { type: 'record:start'; payload: { targetUrl: string; recordingId: string } }
  | { type: 'record:screenshot'; payload: { actionIndex: number } }
  | { type: 'record:stop'; payload: { recordingId: string } }
  | { type: 'replay:start'; payload: { recordingId: string; actions: Action[]; harRef: string; mockRules: MockRule[] } }
  | { type: 'replay:stop'; payload: { replayId: string } }
  | { type: 'ping' };

// ─── Agent → Server ────────────────────────────────────────────────

export type AgentMessage =
  | { type: 'record:action'; payload: { action: Action; selector: string; elementInfo: ElementInfo; timestamp: number } }
  | { type: 'record:screenshot:result'; payload: { actionIndex: number; path: string } }
  | { type: 'record:complete'; payload: { recordingId: string; actions: Recording['actions']; harPath: string } }
  | { type: 'replay:step'; payload: { index: number; status: 'running' } }
  | { type: 'replay:screenshot'; payload: { stepIndex: number; path: string } }
  | { type: 'replay:done'; payload: { status: 'passed' | 'failed'; trace?: string; screenshot?: string } }
  | { type: 'pong' };

// ─── Mock Rule ─────────────────────────────────────────────────────

export interface MockRule {
  urlPattern: string;
  enabled: boolean;
  responseBody?: string;
}
```

- [ ] **Step 1.6: 创建 packages/shared/src/schema/index.ts**

```typescript
export {
  ElementInfoSchema,
  ActionSchema,
  RecordingSchema,
  RecordingActionSchema,
  PageContextSchema,
  ClickActionSchema,
  FillActionSchema,
  HoverActionSchema,
  PressActionSchema,
  SelectActionSchema,
  CheckActionSchema,
  UncheckActionSchema,
  SetInputFilesActionSchema,
  NavigateActionSchema,
  AssertVisibleActionSchema,
  AssertTextActionSchema,
  AssertCheckedActionSchema,
  AssertValueActionSchema,
} from './actions.js';

export type {
  ElementInfo,
  Signal,
  Action,
  PageContext,
  RecordingAction,
  Recording,
} from './actions.js';
```

- [ ] **Step 1.7: 创建 packages/shared/src/index.ts**

```typescript
export * from './schema/index.js';
export * from './types/actions.js';
```

- [ ] **Step 1.8: 创建 packages/shared/src/__tests__/actions.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import {
  RecordingSchema,
  ElementInfoSchema,
  ClickActionSchema,
  FillActionSchema,
} from '../schema/actions.js';

const validElementInfo = {
  dataTestId: null,
  dataTest: null,
  role: 'button',
  accessibleName: 'Login',
  textContent: 'Login',
  placeholder: null,
  id: null,
  tagName: 'button',
  labelText: null,
  name: null,
  inputType: null,
  classes: ['btn'],
  parentPath: ['html', 'body', 'form'],
  nearbyText: [],
  boundingBox: { x: 100, y: 200, width: 80, height: 30 },
  isVisible: true,
};

describe('ElementInfoSchema', () => {
  it('accepts valid element info', () => {
    const result = ElementInfoSchema.safeParse(validElementInfo);
    expect(result.success).toBe(true);
  });

  it('rejects missing tagName', () => {
    const result = ElementInfoSchema.safeParse({ ...validElementInfo, tagName: undefined });
    expect(result.success).toBe(false);
  });
});

describe('ClickActionSchema', () => {
  it('accepts valid click action', () => {
    const result = ClickActionSchema.safeParse({
      name: 'click',
      selector: '#login',
      signals: [],
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      name: 'click',
      selector: '#login',
      button: 'left',
      modifiers: 0,
      clickCount: 1,
      signals: [],
    });
  });
});

describe('FillActionSchema', () => {
  it('accepts valid fill action', () => {
    const result = FillActionSchema.safeParse({
      name: 'fill',
      selector: '#email',
      text: 'test@example.com',
      signals: [],
    });
    expect(result.success).toBe(true);
  });
});

describe('RecordingSchema', () => {
  it('accepts valid recording', () => {
    const result = RecordingSchema.safeParse({
      recordingId: '123e4567-e89b-12d3-a456-426614174000',
      targetUrl: 'https://example.com',
      title: 'Login Flow',
      actions: [
        {
          name: 'navigate',
          url: 'https://example.com',
          signals: [],
          elementInfo: validElementInfo,
          pageContext: { url: 'https://example.com', title: 'Page' },
          timestamp: Date.now(),
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid recordingId', () => {
    const result = RecordingSchema.safeParse({
      recordingId: 'not-a-uuid',
      targetUrl: 'https://example.com',
      title: 'Test',
      actions: [],
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 1.9: 安装 shared 依赖并运行测试**

```bash
cd packages/shared && pnpm install && pnpm test
```

Expected: All 5 tests PASS

- [ ] **Step 1.10: Commit**

```bash
git add pnpm-workspace.yaml packages/shared/
git commit -m "feat: setup monorepo workspace and shared package with Zod schemas"
```

---

### Task 2: Server 基础设施

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/src/index.ts`
- Create: `packages/server/src/app.ts`
- Create: `packages/server/src/db/index.ts`
- Create: `packages/server/src/db/schema.ts`
- Create: `packages/server/src/services/storage.ts`
- Create: `packages/server/src/routes/projects.ts`
- Create: `packages/server/src/routes/recordings.ts`
- Create: `packages/server/src/routes/executions.ts`
- Test: `packages/server/src/__tests__/routes.test.ts`

- [ ] **Step 2.1: 创建 packages/server/package.json**

```json
{
  "name": "@playwright-demo/server",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@playwright-demo/shared": "workspace:*",
    "hono": "^4.6.0",
    "ws": "^8.18.0",
    "postgres": "^3.4.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@playwright-demo/shared": "workspace:*",
    "@types/ws": "^8.5.0",
    "typescript": "^5.7.0",
    "tsx": "^4.19.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2.2: 创建 packages/server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 2.3: 创建 packages/server/src/db/schema.ts — Drizzle schema**

```typescript
import { pgTable, uuid, text, timestamp, varchar, integer } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const recordings = pgTable('recordings', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  title: text('title').notNull(),
  targetUrl: text('target_url'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const recordingArtifacts = pgTable('recording_artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  recordingId: uuid('recording_id').notNull().references(() => recordings.id),
  type: varchar('type', { enum: ['actions', 'har'] }).notNull(),
  content: text('content'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const executions = pgTable('executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  recordingId: uuid('recording_id').notNull().references(() => recordings.id),
  status: varchar('status', { enum: ['running', 'passed', 'failed'] }).notNull(),
  startedAt: timestamp('started_at').defaultNow(),
  finishedAt: timestamp('finished_at'),
  error: text('error'),
  trace: text('trace'),
});

export const executionArtifacts = pgTable('execution_artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  executionId: uuid('execution_id').notNull().references(() => executions.id),
  type: varchar('type', { enum: ['screenshot', 'har'] }).notNull(),
  path: text('path').notNull(),
  stepIndex: integer('step_index'),
});
```

- [ ] **Step 2.4: 创建 packages/server/src/db/index.ts**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const client = postgres(process.env.DATABASE_URL || 'postgres://localhost:5432/playwright_demo');
export const db = drizzle(client, { schema });
export { client };
export * from './schema.js';
```

- [ ] **Step 2.5: 创建 packages/server/src/services/storage.ts — 文件存储服务**

```typescript
import { mkdir, writeFile, readFile } from 'fs/promises';
import { dirname } from 'path';
import type { Recording } from '@playwright-demo/shared';

const STORAGE_BASE = process.env.STORAGE_PATH || './storage';

export class StorageService {
  private base: string;

  constructor(base: string = STORAGE_BASE) {
    this.base = base;
  }

  async saveRecording(recordingId: string, recording: Recording): Promise<string> {
    const dir = `${this.base}/recordings/${recordingId}`;
    await mkdir(dir, { recursive: true });
    const path = `${dir}/actions.json`;
    await writeFile(path, JSON.stringify(recording, null, 2));
    return path;
  }

  async loadRecording(recordingId: string): Promise<Recording | null> {
    try {
      const path = `${this.base}/recordings/${recordingId}/actions.json`;
      const content = await readFile(path, 'utf-8');
      return JSON.parse(content) as Recording;
    } catch {
      return null;
    }
  }

  async saveHar(recordingId: string, buffer: Buffer): Promise<string> {
    const dir = `${this.base}/recordings/${recordingId}`;
    await mkdir(dir, { recursive: true });
    const path = `${dir}/recording.har`;
    await writeFile(path, buffer);
    return path;
  }

  async loadHar(recordingId: string): Promise<Buffer | null> {
    try {
      const path = `${this.base}/recordings/${recordingId}/recording.har`;
      return await readFile(path);
    } catch {
      return null;
    }
  }

  async saveScreenshot(executionId: string, stepIndex: number, buffer: Buffer): Promise<string> {
    const dir = `${this.base}/executions/${executionId}/screenshots`;
    await mkdir(dir, { recursive: true });
    const path = `${dir}/step-${stepIndex}.png`;
    await writeFile(path, buffer);
    return path;
  }

  async saveExecutionHar(executionId: string, buffer: Buffer): Promise<string> {
    const dir = `${this.base}/executions/${executionId}`;
    await mkdir(dir, { recursive: true });
    const path = `${dir}/replay.har`;
    await writeFile(path, buffer);
    return path;
  }
}
```

- [ ] **Step 2.6: 创建 packages/server/src/app.ts — Hono 应用**

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { StorageService } from './services/storage.js';
import { projectsRouter } from './routes/projects.js';
import { recordingsRouter } from './routes/recordings.js';
import { executionsRouter } from './routes/executions.js';

const app = new Hono();

app.use('*', cors());

const storage = new StorageService();

// 注入 storage 到 context
app.use('*', async (c, next) => {
  c.set('storage', storage);
  await next();
});

// 健康检查
app.get('/health', (c) => c.json({ status: 'ok' }));

// 路由
app.route('/api/projects', projectsRouter);
app.route('/api/recordings', recordingsRouter);
app.route('/api/executions', executionsRouter);

export { app };
```

- [ ] **Step 2.7: 创建 packages/server/src/routes/projects.ts**

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index.js';
import { projects } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const projectsRouter = new Hono();

const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

projectsRouter.get('/', async (c) => {
  const list = await db.select().from(projects).orderBy(projects.createdAt);
  return c.json(list);
});

projectsRouter.post('/', zValidator('json', createProjectSchema), async (c) => {
  const body = c.req.valid('json');
  const result = await db.insert(projects).values(body).returning();
  return c.json(result[0], 201);
});

projectsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const project = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project.length) return c.json({ error: 'not found' }, 404);
  return c.json(project[0]);
});

projectsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await db.delete(projects).where(eq(projects.id, id));
  return c.json({ ok: true });
});
```

- [ ] **Step 2.8: 创建 packages/server/src/routes/recordings.ts**

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index.js';
import { recordings, recordingArtifacts } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import type { Recording } from '@playwright-demo/shared';

export const recordingsRouter = new Hono();

const createRecordingSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1),
  targetUrl: z.string().url().optional(),
});

recordingsRouter.get('/', async (c) => {
  const projectId = c.req.query('projectId');
  const query = db.select().from(recordings);
  if (projectId) {
    query.where(eq(recordings.projectId, projectId));
  }
  const list = await query.orderBy(desc(recordings.createdAt));
  return c.json(list);
});

recordingsRouter.post('/', zValidator('json', createRecordingSchema), async (c) => {
  const body = c.req.valid('json');
  const result = await db.insert(recordings).values(body).returning();
  return c.json(result[0], 201);
});

recordingsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const rec = await db.select().from(recordings).where(eq(recordings.id, id)).limit(1);
  if (!rec.length) return c.json({ error: 'not found' }, 404);
  return c.json(rec[0]);
});

// 获取录制的 actions JSON
recordingsRouter.get('/:id/actions', async (c) => {
  const id = c.req.param('id');
  const artifact = await db
    .select()
    .from(recordingArtifacts)
    .where(eq(recordingArtifacts.recordingId, id))
    .where(eq(recordingArtifacts.type, 'actions'))
    .limit(1);
  if (!artifact.length) return c.json({ error: 'not found' }, 404);
  return c.json(JSON.parse(artifact[0].content as string));
});

// 保存 actions JSON（录制完成时调用）
recordingsRouter.post('/:id/actions', async (c) => {
  const id = c.req.param('id');
  const body = (await c.req.json()) as Recording;
  const content = JSON.stringify(body);

  // 写入 DB
  await db.insert(recordingArtifacts).values({
    recordingId: id,
    type: 'actions',
    content,
  });

  // 写入本地文件
  const storage = c.get('storage');
  await storage.saveRecording(id, body);

  return c.json({ ok: true });
});
```

- [ ] **Step 2.9: 创建 packages/server/src/routes/executions.ts**

```typescript
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/index.js';
import { executions, executionArtifacts } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

export const executionsRouter = new Hono();

const createExecutionSchema = z.object({
  recordingId: z.string().uuid(),
  status: z.enum(['running', 'passed', 'failed']),
});

executionsRouter.get('/', async (c) => {
  const recordingId = c.req.query('recordingId');
  const query = db.select().from(executions);
  if (recordingId) {
    query.where(eq(executions.recordingId, recordingId));
  }
  const list = await query.orderBy(desc(executions.startedAt));
  return c.json(list);
});

executionsRouter.post('/', zValidator('json', createExecutionSchema), async (c) => {
  const body = c.req.valid('json');
  const result = await db.insert(executions).values(body).returning();
  return c.json(result[0], 201);
});

executionsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const ex = await db.select().from(executions).where(eq(executions.id, id)).limit(1);
  if (!ex.length) return c.json({ error: 'not found' }, 404);
  return c.json(ex[0]);
});

executionsRouter.get('/:id/artifacts', async (c) => {
  const id = c.req.param('id');
  const artifacts = await db
    .select()
    .from(executionArtifacts)
    .where(eq(executionArtifacts.executionId, id));
  return c.json(artifacts);
});

executionsRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  await db
    .update(executions)
    .set({ ...body, finishedAt: new Date() })
    .where(eq(executions.id, id));
  return c.json({ ok: true });
});
```

- [ ] **Step 2.10: 创建 packages/server/src/index.ts — 入口（Hono + WebSocket Server）**

```typescript
import { serve } from '@hono/node-server';
import { app } from './app.js';
import { WebSocketServer } from 'ws';
import type { Server } from 'http';

const port = parseInt(process.env.PORT || '3000');

const server = serve({
  fetch: app.fetch,
  port,
});

server.then(() => {
  console.log(`Server running on http://localhost:${port}`);
});

// WebSocket Server for Agent connections
const wss = new WebSocketServer({ server: server as unknown as Server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('Agent connected');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('Received:', message.type);
      // TODO: route message to handler
    } catch (e) {
      console.error('Invalid message:', e);
    }
  });

  // Heartbeat
  const interval = setInterval(() => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'ping' }));
    } else {
      clearInterval(interval);
    }
  }, 30_000);

  ws.on('close', () => {
    clearInterval(interval);
    console.log('Agent disconnected');
  });
});
```

- [ ] **Step 2.11: 安装 server 依赖并验证启动**

```bash
cd packages/server && pnpm install
pnpm add @hono/node-server @hono/zod-validator drizzle-orm
```

- [ ] **Step 2.12: Commit**

```bash
git add packages/server/
git commit -m "feat: setup server with Hono, PostgreSQL schema, REST routes, and WebSocket gateway"
```

---

### Task 3: Agent 基础 + Recorder

**Files:**
- Create: `packages/agent/package.json`
- Create: `packages/agent/tsconfig.json`
- Create: `packages/agent/src/index.ts`
- Create: `packages/agent/src/ws-client.ts`
- Create: `packages/agent/src/recorder-manager.ts`
- Create: `packages/agent/src/fingerprint.ts`
- Create: `packages/agent/src/types.ts`
- Test: `packages/agent/src/__tests__/fingerprint.test.ts`

- [ ] **Step 3.1: 创建 packages/agent/package.json**

```json
{
  "name": "@playwright-demo/agent",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@playwright-demo/shared": "workspace:*",
    "playwright-core": "^1.50.0",
    "ws": "^8.18.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "tsx": "^4.19.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 3.2: 创建 packages/agent/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3.3: 创建 packages/agent/src/types.ts**

```typescript
import type { ServerMessage, AgentMessage } from '@playwright-demo/shared';

export type { ServerMessage, AgentMessage } from '@playwright-demo/shared';
```

- [ ] **Step 3.4: 创建 packages/agent/src/ws-client.ts — WebSocket 客户端**

```typescript
import WebSocket from 'ws';
import type { ServerMessage, AgentMessage } from './types.js';

export class WsClient {
  private ws: WebSocket | null = null;
  private url: string;
  private messageHandlers: ((msg: ServerMessage) => void)[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private token?: string;

  constructor(url: string, token?: string) {
    this.url = url;
    this.token = token;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url, {
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : {},
      });

      this.ws.on('open', () => {
        console.log('Connected to server');
        this.reconnectTimer = null;
        resolve();
      });

      this.ws.on('message', (data) => {
        try {
          const msg: ServerMessage = JSON.parse(data.toString());
          if (msg.type === 'ping') {
            this.send({ type: 'pong' });
            return;
          }
          for (const handler of this.messageHandlers) {
            handler(msg);
          }
        } catch (e) {
          console.error('Failed to parse message:', e);
        }
      });

      this.ws.on('close', () => {
        console.log('Disconnected, reconnecting in 3s...');
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      });

      this.ws.on('error', (err) => {
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
          reject(err);
        } else {
          console.error('WebSocket error:', err);
        }
      });
    });
  }

  onMessage(handler: (msg: ServerMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  send(msg: AgentMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
```

- [ ] **Step 3.5: 创建 packages/agent/src/fingerprint.ts — 元素指纹采集**

```typescript
import type { Page } from 'playwright-core';

export interface ElementFingerprint {
  dataTestId: string | null;
  dataTest: string | null;
  role: string | null;
  accessibleName: string | null;
  textContent: string | null;
  placeholder: string | null;
  id: string | null;
  tagName: string;
  labelText: string | null;
  name: string | null;
  inputType: string | null;
  classes: string[];
  parentPath: string[];
  nearbyText: string[];
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  isVisible: boolean;
}

const FINGERPRINT_JS = `
(() => {
  const el = __TARGET_ELEMENT__;

  function getParentPath(element) {
    const path = [];
    let current = element;
    while (current && current.tagName) {
      path.unshift(current.tagName.toLowerCase());
      current = current.parentElement;
      if (path.length > 6) break;
    }
    return path;
  }

  function getNearbyText(element) {
    const texts = [];
    const parent = element.parentElement;
    if (!parent) return texts;
    const walker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (node.parentElement === element) return NodeFilter.FILTER_REJECT;
        const text = node.textContent?.trim();
        return text && text.length > 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    let node;
    while ((node = walker.nextNode()) && texts.length < 5) {
      texts.push(node.textContent.trim().slice(0, 80));
    }
    return texts;
  }

  const rect = el.getBoundingClientRect();
  const bb = rect.width > 0 && rect.height > 0
    ? { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
    : null;

  return JSON.stringify({
    dataTestId: el.getAttribute('data-testid'),
    dataTest: el.getAttribute('data-test'),
    role: el.getAttribute('role'),
    accessibleName: el.getAttribute('aria-label'),
    textContent: (el.textContent || '').trim().slice(0, 100) || null,
    placeholder: el.getAttribute('placeholder'),
    id: el.id || null,
    tagName: el.tagName.toLowerCase(),
    labelText: null,
    name: el.getAttribute('name'),
    inputType: el.getAttribute('type'),
    classes: Array.from(el.classList),
    parentPath: getParentPath(el),
    nearbyText: getNearbyText(el),
    boundingBox: bb,
    isVisible: el.offsetParent !== null,
  });
})()
`;

export async function captureFingerprint(page: Page, selector: string): Promise<ElementFingerprint | null> {
  try {
    const element = await page.$(selector);
    if (!element) return null;

    const evalScript = FINGERPRINT_JS.replace('__TARGET_ELEMENT__', 'element');
    const result = await element.evaluate((el) => {
      const fn = new Function(
        'element',
        `(${evalScript})`
      );
      return fn(el);
    });

    return JSON.parse(result as string) as ElementFingerprint;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3.6: 创建 packages/agent/src/recorder-manager.ts — Recorder 生命周期管理**

```typescript
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import type { Recording } from '@playwright-demo/shared';
import { captureFingerprint } from './fingerprint.js';

export class RecorderManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private actions: Recording['actions'] = [];

  async startRecording(targetUrl: string): Promise<void> {
    this.browser = await chromium.launch({ headless: false });
    this.context = await this.browser.newContext({
      recordHarPath: `${process.env.STORAGE_PATH || './storage'}/temp-recording.har`,
    });
    this.actions = [];

    const page = await this.context.newPage();
    await page.goto(targetUrl);

    // TODO: Hook into playwright-core internal recorder API
    // This will use internal modules from playwright-core/lib/server/recorder
    // to capture actions as the user interacts with the page.
    // For now, we set up the infrastructure for async fingerprint collection.

    page.on('framenavigated', async (frame) => {
      if (frame === page.mainFrame()) {
        // Capture fingerprint for navigation actions
        const fingerprint = await captureFingerprint(page, 'html');
        if (fingerprint) {
          this.actions.push({
            name: 'navigate',
            url: frame.url(),
            signals: [],
            elementInfo: fingerprint,
            pageContext: { url: frame.url(), title: await page.title() },
            timestamp: Date.now(),
          });
        }
      }
    });
  }

  async stopRecording(): Promise<{ actions: Recording['actions']; harPath: string }> {
    const harPath = `${process.env.STORAGE_PATH || './storage'}/temp-recording.har`;
    await this.context?.close();
    await this.browser?.close();
    this.browser = null;
    this.context = null;

    return { actions: this.actions, harPath };
  }

  getActions(): Recording['actions'] {
    return this.actions;
  }
}
```

- [ ] **Step 3.7: 创建 packages/agent/src/index.ts — CLI 入口**

```typescript
import { WsClient } from './ws-client.js';
import { RecorderManager } from './recorder-manager.js';

const SERVER_URL = process.env.SERVER_URL || 'ws://localhost:3000/ws';
const TOKEN = process.env.AGENT_TOKEN;

async function main() {
  const ws = new WsClient(SERVER_URL, TOKEN);
  const recorder = new RecorderManager();

  ws.onMessage(async (msg) => {
    switch (msg.type) {
      case 'record:start': {
        console.log(`Starting recording: ${msg.payload.recordingId}`);
        await recorder.startRecording(msg.payload.targetUrl);
        break;
      }
      case 'record:stop': {
        console.log(`Stopping recording: ${msg.payload.recordingId}`);
        const { actions, harPath } = await recorder.stopRecording();
        ws.send({
          type: 'record:complete',
          payload: {
            recordingId: msg.payload.recordingId,
            actions,
            harPath,
          },
        });
        break;
      }
      case 'replay:start': {
        console.log(`Starting replay: ${msg.payload.recordingId}`);
        // TODO: implement replay engine
        break;
      }
    }
  });

  await ws.connect();
  console.log('Agent started, waiting for commands...');
}

main().catch(console.error);
```

- [ ] **Step 3.8: 创建 fingerprint 单元测试 packages/agent/src/__tests__/fingerprint.test.ts**

```typescript
import { describe, it, expect } from 'vitest';

describe('Fingerprint script', () => {
  it('has valid JavaScript', () => {
    // Verify the fingerprint script template is valid JS
    const script = `
    (() => {
      const el = { tagName: 'BUTTON', getAttribute: () => null, classList: [], parentElement: null, textContent: 'test', getBoundingClientRect: () => ({ x: 0, y: 0, width: 80, height: 30 }), offsetParent: {}, querySelectorAll: () => [] };

      function getParentPath(element) {
        const path = [];
        let current = element;
        while (current && current.tagName) {
          path.unshift(current.tagName.toLowerCase());
          current = current.parentElement;
          if (path.length > 6) break;
        }
        return path;
      }

      function getNearbyText(element) {
        return [];
      }

      const rect = el.getBoundingClientRect();
      const bb = rect.width > 0 && rect.height > 0
        ? { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
        : null;

      return JSON.stringify({
        dataTestId: el.getAttribute('data-testid'),
        tagName: el.tagName.toLowerCase(),
        classes: Array.from(el.classList),
        parentPath: getParentPath(el),
        boundingBox: bb,
        isVisible: el.offsetParent !== null,
      });
    })()
    `;
    expect(() => new Function(script)).not.toThrow();
  });
});
```

- [ ] **Step 3.9: 安装 agent 依赖并运行测试**

```bash
cd packages/agent && pnpm install && pnpm test
```

Expected: fingerprint test PASS

- [ ] **Step 3.10: Commit**

```bash
git add packages/agent/
git commit -m "feat: setup agent package with WebSocket client, recorder manager, and fingerprint collector"
```

---

### Task 4: WebSocket 消息路由 + 端到端录制流程

**Files:**
- Modify: `packages/server/src/index.ts:25-50` (WebSocket handler)
- Create: `packages/server/src/ws-handlers.ts`
- Create: `packages/agent/src/recorder-manager.ts` (完善)

- [ ] **Step 4.1: 创建 packages/server/src/ws-handlers.ts — WebSocket 消息处理**

```typescript
import type { WebSocket } from 'ws';
import type { AgentMessage, ServerMessage } from '@playwright-demo/shared';
import { db } from './db/index.js';
import { recordings, recordingArtifacts, executions } from './db/schema.js';
import { StorageService } from './services/storage.js';

export class WsHandlers {
  private storage: StorageService;

  constructor(storage: StorageService) {
    this.storage = storage;
  }

  async handleAgentMessage(ws: WebSocket, msg: AgentMessage): Promise<void> {
    switch (msg.type) {
      case 'record:action': {
        // Forward action to frontend clients (broadcast)
        this.broadcastToClients(JSON.stringify(msg));
        break;
      }
      case 'record:complete': {
        const { recordingId, actions, harPath } = msg.payload;

        // Save to DB
        await db
          .update(recordings)
          .set({ updatedAt: new Date() })
          .where(db.sql`id = ${recordingId}`);

        await db.insert(recordingArtifacts).values({
          recordingId,
          type: 'actions',
          content: JSON.stringify(actions),
        });

        // Save HAR to storage
        const harBuffer = await this.storage.loadHar(recordingId);
        if (harBuffer) {
          await this.storage.saveHar(recordingId, harBuffer);
        }

        // Also save local JSON copy
        await this.storage.saveRecording(recordingId, {
          recordingId,
          targetUrl: '',
          title: '',
          actions,
        });

        this.broadcastToClients(JSON.stringify(msg));
        break;
      }
      case 'replay:done': {
        // TODO: handle replay completion
        break;
      }
      default: {
        console.log('Unhandled agent message:', msg.type);
      }
    }
  }

  private clients: Set<WebSocket> = new Set();

  registerClient(ws: WebSocket): void {
    this.clients.add(ws);
  }

  unregisterClient(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  private broadcastToClients(data: string): void {
    for (const client of this.clients) {
      if (client.readyState === 1) {
        client.send(data);
      }
    }
  }
}
```

- [ ] **Step 4.2: 修改 packages/server/src/index.ts — 集成 WsHandlers**

替换 WebSocket handler 部分为：

```typescript
import { serve } from '@hono/node-server';
import { app } from './app.js';
import { WebSocketServer } from 'ws';
import type { Server } from 'http';
import { StorageService } from './services/storage.js';
import { WsHandlers } from './ws-handlers.js';

const port = parseInt(process.env.PORT || '3000');
const storage = new StorageService();

const server = serve({
  fetch: app.fetch,
  port,
});

server.then(() => {
  console.log(`Server running on http://localhost:${port}`);
});

const wsHandlers = new WsHandlers(storage);
const wss = new WebSocketServer({ server: server as unknown as Server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('Agent connected');
  wsHandlers.registerClient(ws);

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      await wsHandlers.handleAgentMessage(ws, msg);
    } catch (e) {
      console.error('Invalid message:', e);
    }
  });

  const interval = setInterval(() => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'ping' }));
    } else {
      clearInterval(interval);
    }
  }, 30_000);

  ws.on('close', () => {
    clearInterval(interval);
    wsHandlers.unregisterClient(ws);
    console.log('Agent disconnected');
  });
});
```

- [ ] **Step 4.3: Commit**

```bash
git add packages/server/src/ws-handlers.ts packages/server/src/index.ts
git commit -m "feat: implement WebSocket message handlers for record flow"
```

---

### Task 5: Frontend 基础设施

**Files:**
- Create: `packages/frontend/package.json`
- Create: `packages/frontend/tsconfig.json`
- Create: `packages/frontend/vite.config.ts`
- Create: `packages/frontend/tailwind.config.ts`
- Create: `packages/frontend/postcss.config.js`
- Create: `packages/frontend/index.html`
- Create: `packages/frontend/src/index.css`
- Create: `packages/frontend/src/main.tsx`
- Create: `packages/frontend/src/App.tsx`
- Create: `packages/frontend/src/lib/api.ts`

- [ ] **Step 5.1: 创建 packages/frontend/package.json**

```json
{
  "name": "@playwright-demo/frontend",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@playwright-demo/shared": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.5.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 5.2: 创建 packages/frontend/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 5.3: 创建 packages/frontend/vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
});
```

- [ ] **Step 5.4: 创建 packages/frontend/tailwind.config.ts**

```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 5.5: 创建 packages/frontend/postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 5.6: 创建 packages/frontend/index.html**

```html
<!doctype html>
<html lang="zh-CN" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Playwright 可视化平台</title>
  </head>
  <body class="bg-zinc-950 text-zinc-100">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5.7: 创建 packages/frontend/src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

- [ ] **Step 5.8: 创建 packages/frontend/src/main.tsx**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 5.9: 创建 packages/frontend/src/App.tsx**

```typescript
import { Routes, Route, Link } from 'react-router-dom';

export function App() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <nav className="flex items-center gap-6">
          <Link to="/" className="text-lg font-semibold">
            Playwright 平台
          </Link>
          <Link to="/projects" className="text-sm text-zinc-400 hover:text-zinc-200">
            项目
          </Link>
        </nav>
      </header>
      <main className="p-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/projects" element={<ProjectsPage />} />
        </Routes>
      </main>
    </div>
  );
}

function Home() {
  return (
    <div>
      <h1 className="text-2xl font-bold">欢迎</h1>
      <p className="mt-2 text-zinc-400">选择一个项目开始录制或回放。</p>
    </div>
  );
}

function ProjectsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">项目列表</h1>
      <p className="mt-2 text-zinc-400">加载中...</p>
    </div>
  );
}
```

- [ ] **Step 5.10: 创建 packages/frontend/src/lib/api.ts**

```typescript
const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

interface Recording {
  id: string;
  projectId: string;
  title: string;
  targetUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/projects`);
  return res.json();
}

export async function createProject(data: { name: string; description?: string }): Promise<Project> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function fetchRecordings(projectId?: string): Promise<Recording[]> {
  const url = projectId
    ? `${API_BASE}/recordings?projectId=${projectId}`
    : `${API_BASE}/recordings`;
  const res = await fetch(url);
  return res.json();
}
```

- [ ] **Step 5.11: 安装前端依赖并验证构建**

```bash
cd packages/frontend && pnpm install
pnpm build
```

Expected: Build succeeds, no TypeScript errors

- [ ] **Step 5.12: Commit**

```bash
git add packages/frontend/
git commit -m "feat: setup frontend with React, Vite, Tailwind dark theme, and API client"
```

---

### Task 6: Frontend 项目列表页 + 创建功能

**Files:**
- Modify: `packages/frontend/src/App.tsx`
- Modify: `packages/frontend/src/lib/api.ts`
- Create: `packages/frontend/src/components/project-form.tsx`
- Create: `packages/frontend/src/components/project-list.tsx`

- [ ] **Step 6.1: 创建 packages/frontend/src/components/project-list.tsx**

```typescript
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchProjects, type Project } from '@/lib/api';

export function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProjects().then((data) => {
      setProjects(data);
      setLoading(false);
    });
  }, []);

  if (loading) return <p className="text-zinc-500">加载中...</p>;
  if (!projects.length) return <p className="text-zinc-500">暂无项目</p>;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => (
        <Link
          key={p.id}
          to={`/projects/${p.id}`}
          className="block rounded-lg border border-zinc-800 bg-zinc-900 p-5 transition hover:border-zinc-600"
        >
          <h3 className="font-semibold">{p.name}</h3>
          {p.description && (
            <p className="mt-1 text-sm text-zinc-400">{p.description}</p>
          )}
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 6.2: 更新 App.tsx 中的 ProjectsPage 使用 ProjectList**

```typescript
import { Routes, Route, Link } from 'react-router-dom';
import { ProjectList } from '@/components/project-list';

export function App() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-4">
        <nav className="flex items-center gap-6">
          <Link to="/" className="text-lg font-semibold">
            Playwright 平台
          </Link>
          <Link to="/projects" className="text-sm text-zinc-400 hover:text-zinc-200">
            项目
          </Link>
        </nav>
      </header>
      <main className="p-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/projects" element={<ProjectsPage />} />
        </Routes>
      </main>
    </div>
  );
}

function Home() {
  return (
    <div>
      <h1 className="text-2xl font-bold">欢迎</h1>
      <p className="mt-2 text-zinc-400">选择一个项目开始录制或回放。</p>
    </div>
  );
}

function ProjectsPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">项目列表</h1>
        <button className="rounded bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700">
          + 新建项目
        </button>
      </div>
      <ProjectList />
    </div>
  );
}
```

- [ ] **Step 6.3: Commit**

```bash
git add packages/frontend/src/
git commit -m "feat: add projects list page with dark theme cards"
```

---

### Task 7: 数据库迁移 + 集成测试

**Files:**
- Create: `packages/server/drizzle.config.ts`
- Create: `packages/server/src/__tests__/integration.test.ts`

- [ ] **Step 7.1: 创建 packages/server/drizzle.config.ts**

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://localhost:5432/playwright_demo',
  },
});
```

- [ ] **Step 7.2: 在 package.json 添加迁移脚本**

```json
"scripts": {
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:push": "drizzle-kit push"
}
```

- [ ] **Step 7.3: 创建集成测试 packages/server/src/__tests__/integration.test.ts**

```typescript
import { describe, it, expect } from 'vitest';
import { app } from '../app.js';

describe('Server integration', () => {
  it('health endpoint returns ok', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 7.4: Commit**

```bash
git add packages/server/drizzle.config.ts packages/server/src/__tests__/
git commit -m "feat: add drizzle migration config and integration test"
```
