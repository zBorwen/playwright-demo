# 项目质量审查报告

> 审查日期：2026-05-29
> 审查分支：`review/project-quality-check`
> 审查范围：`packages/shared`、`packages/server`、`packages/agent`、`packages/frontend`（~9,275 行 TS 源代码）

---

## 总览

| 维度 | 评分 | 关键发现 |
|------|------|----------|
| 🔤 代码规范 | **6/10** | agent 包 `any` 类型泛滥，server/recordings.ts 超 400 行，部分注释用英文 |
| 🧪 测试质量 | **5/10** | 三个最复杂文件无测试，已测模块深度不足，无 E2E 测试 |
| 🏗️ 架构设计 | **7/10** | Zod discriminatedUnion 协议设计优秀，WS 消息过滤和路由层过重是短板 |
| 🔒 安全性 | **4/10** | WS 零认证/零校验，多路由缺少输入验证，路径遍历风险 |
| 📚 文档与Git | **7/10** | 技术文档质量高，CLAUDE.md 严重过期，GEMINI.md 完全重复 |

**综合评分：5.8 / 10**（均值）

| 严重程度 | 数量 |
|----------|------|
| 🔴 Critical | 13 |
| 🟠 Major | 28 |
| 🟡 Minor | 28 |
| 🔵 Info | 10 |

---

## 一、代码规范（6/10）

### 优势

- 目录和文件名全部使用 kebab-case，无违规
- 类/接口命名均为 PascalCase，组件命名正确
- 未发现内嵌 SVG
- UPPER_SNAKE_CASE 常量命名在 frontend 包中执行良好
- 大部分工具函数使用 `function` 声明而非箭头函数
- 业务逻辑相关注释使用中文

### 核心问题

**1. any 类型使用（critical × 7）**

agent 包是类型安全最薄弱的环节：
- `packages/shared/src/schema/protocol.ts:37` — `z.array(z.any())`
- `packages/agent/src/index.ts:102` — `(payload as any).replaySpeed`
- `packages/agent/src/types/tasks.ts:6` — `PendingTask.payload: any`
- `packages/agent/src/core/recorder/transformer.ts:8,13` — 参数和变量类型为 `any`
- `packages/agent/src/core/replay/engine.ts:210,284` — `as any` 强制断言
- `packages/agent/src/pool/worker-pool.ts:56,108` — `Record<string, any>`
- `packages/agent/src/types/playwright-internal.ts:21,28,29` — 多个 `any` 类型

**2. 文件超长（major）**
- `packages/server/src/routes/recordings.ts` — 422 行，超出 400 行限制

**3. 命名不规范（minor）**
- `browserLaunchers` 应为 `BROWSER_LAUNCHERS`（agent 包两处）
- `connecting` 布尔字段应为 `isConnecting`
- `allRecs`、`ex`、`recs`、`projs` 使用了不必要的缩写

**4. 其他**
- server 包存在 2 处 JSDoc 注释（recordings.ts、codegen.ts）
- shared/schema 中 section 注释使用英文
- new-recording-slide-over.tsx 中 handleSubmit 使用了箭头函数声明

---

## 二、测试质量（5/10）

### 优势

- 测试基础设施完善（Vitest + TypeScript + @testing-library/react）
- `use-local-storage.test.ts` 和 `time-ago.test.ts` 质量最高，覆盖所有路径
- Schema 测试存在性良好，使用 `safeParse` 验证正/负向路径
- Mock 策略合理，各模块独立 mock

### 核心问题

**🔴 三个最复杂的文件完全没有测试：**

| 文件 | 行数 | 职责 |
|------|------|------|
| `ReplayEngine` | 298 行 | 12 种 action 的回放执行、严格模式回退、截图留证 |
| `RecorderManager` | 227 行 | 录制生命周期、fill 合并、codegen 行累积 |
| `RecordingsRouter` | 423 行 | 8 个 API 端点、批量回放编排 |

**🟠 已测模块深度不足：**
- `actions.test.ts`: 仅测 2/13 种 action
- `transformer.test.ts`: 仅测 4/12 种 action
- `ws-client.test.ts`: 仅测 buffer 和 send，connect/reconnect/close 全未测
- `fingerprint.test.ts`: 内联字面量测试，不测试源码函数 `captureFingerprint`
- `ws-handlers.test.ts`: `handleAgentMessage`（90 行核心逻辑）未测

**缺失测试的完整模块清单：**

| 包 | 缺失测试的文件 |
|------|------|
| server | `recordings.ts`, `executions.ts`, `network.ts`, `codegen.ts`, `har-filter.ts`, `storage.ts`, `error-handler.ts`, `response.ts`, `zod-validator.ts` |
| agent | `engine.ts`, `manager.ts`, `index.ts`, `worker.ts` |
| frontend | `api.ts`, `use-websocket.ts`, `use-recording-websocket.ts`, `syntax-highlight.ts`, `recording-replay-storage.ts`, `app-store.ts`，所有组件 |

**其他问题：**
- 错误路径普遍缺失（DB 失败、网络错误、超时、并发冲突）
- 无集成/E2E 测试，核心数据链路从未被整体验证
- `recording-replay-store.test.ts` 中存在无断言的无效测试用例

---

## 三、架构设计（7/10）

### 优势

- Shared 包使用 Zod discriminatedUnion 定义所有消息类型，类型安全性优秀
- Agent 采用 Worker Pool（child_process fork）实现并发回放隔离
- 前端 Zustand + Immer + useShallow 细粒度订阅，避免高频重渲染
- 「影子缓冲队列」优雅解决 WS 消息在组件挂载前到达的时序竞态
- 录制、回放、代码生成三种格式统一通过 RecordingAction discriminatedUnion 建模
- Server 全局错误处理中间件统一捕获异常，API 响应格式一致
- Agent WsClient 具备断线重连和离线消息缓冲机制

### 核心问题

**🔴 ServerMessage schema 不完整**
`ServerMessageSchema` 仅定义 4 种 discriminatedUnion 变体（record:start/stop、replay:start、ping），但服务器实际发送 batch-replay:start、batch-replay:result、error 等消息类型，未经 schema 校验。

**🟠 Server 路由层过重**
`recordings.ts` 达 423 行，混合了路由定义、批量回放编排、DB 直接操作、HAR 处理、删除操作。应将 `executeBatchReplay` 提取到独立 service。

**🟠 前端 WS 全局单例缺乏消息过滤**
所有组件通过 `subscribeToMessages` 接收所有消息，无按 recordingId/executionId 过滤，存在广播风暴和跨组件干扰风险。

**🟠 PendingTask.payload 类型为 any**
Agent 的 id 字段语义混淆（既用于 recordingId 又用于 executionId），依赖运行时区分。

**🟠 模块级可变单例**
`context.ts` 中 `wsHandlers` 是模块级 `let` 变量，存在并发安全隐患且难以在测试中隔离。

**🟡 其他架构问题**
- frontend api.ts 重复定义了实体类型，与 shared 包不一致
- Worker 退出时机与 IPC 消息发送完成未绑定
- 部分关键模块（ws-handlers、StorageService）缺少测试

---

## 四、安全性（4/10）

### 优势

- SQL 注入防护优秀：所有查询使用 Drizzle ORM 参数化方法
- Shared 包 Zod schema 定义了完整的消息协议
- 全局错误处理程序掩盖内部错误
- 无硬编码密钥，AGENT_TOKEN 从环境变量读取

### 核心问题

**🔴 WebSocket 零认证（C-1, C-2）**
Agent 客户端发送 `Authorization: Bearer` 头，但**服务器完全忽略**。任何人都可通过 `agentId=default` 冒充 Agent。同时，Zod schema（`AgentMessageSchema`）已定义但从未在 `onmessage` 中调用 `.safeParse()`。

**🔴 多个路由缺少输入校验（C-3, C-4）**
- `PATCH /api/executions/:id` — 直接 `{ ...body }` 扩散到 DB update，可修改任意列
- `DELETE /api/recordings/batch` — `body.ids as string[]` 无校验直接使用

**🟠 路径参数未做 UUID 校验（C-5）**
10 个路由的路径参数（`:id`）未校验，任意字符串可到达文件系统路径拼接。

**🟠 路径遍历风险（P-1）**
存储路径由字符串插值构建，来自 Agent 消息的 `harRef` 未经清理即用于文件读取。

**🟠 CORS 通配符且无安全头（M-1）**
`cors()` 无参数调用，未设置 X-Content-Type-Options、HSTS、CSP 等头。

**🟠 删除路由错误信息泄露（M-2）**
`(e as Error).message` 直接返回给客户端，可能暴露内部路径和数据库信息。

**🟡 .env 文件未排除（MIN-1）**
`.gitignore` 未添加 `.env` 模式，目前 `packages/frontend/.env` 已被提交。

**修复优先级：**
1. C-1 + C-2：WS 消息 Zod 校验 + Token 认证
2. C-3 + C-4：路由输入 Zod schema
3. P-1：文件路径清理
4. C-5：UUID 路径参数校验
5. M-2：通用错误消息
6. MIN-1：gitignore 补充

---

## 五、文档与 Git 规范（7/10）

### 优势

- `BUG_LOG.md` 质量极高，每个 bug 记录四段式（现象/根因/修复/教训）
- `docs/` 下 4 篇架构文档专业深入
- `AGENTS.md` 认知模型设计为 AI 代理提供清晰推理框架
- `DEPLOYMENT.md` 包含完整的本地开发、生产部署和 Docker 方案
- Git 提交粒度良好，大部分聚焦单一变更
- `DEV_NOTE.md` 补充了技术选型背景和权衡

### 核心问题

**🔴 CLAUDE.md/GEMINI.md 严重过期**
开头声明「尚未完成脚手架搭建」，但项目已有完整 4 包 monorepo 架构、录制/回放/Mock 全功能。同时 GEMINI.md 与 CLAUDE.md 内容 100% 重复，应删除或改为引用。

**🟠 多处内容过期或矛盾**
- README.md（12 个测试）与 TESTING.md（15 个测试）数字不一致且均过期
- DEV_NOTE.md 关于 Recorder 的描述「注入 JS 事件监听」已切换为 playwright-core 内部 API
- TODO.md 中「录制器集成 playwright-core 内部 API」已完成但未标记
- WIP.md「最近提交」停滞在旧提交列表

**🟠 Git 提交规范问题**
- 约 36 条提交使用英文描述
- 4 类格式偏差：无类型前缀提交、`style:` 未批准类型、`merge:` 类型、`fix(server):` scope 格式
- 分支 `ui-refactor` 未遵循 `<类型>/<描述>` 格式

**🟠 文档可发现性不足**
- CLAUDE.md 文档清单仅列 6 个文件，遗漏 BUG_LOG.md、GEMINI.md、docs/ 下全部文档
- README.md 未链接到 docs/ 下的深度架构文档
- superpowers/plans/ 目录 8 个文件 160KB，与项目文档混放

---

## 改进建议汇总

### 立即行动（本轮可修）

1. **消除 all any**：agent 包 7 处 + shared 1 处 + frontend 1 处
2. **拆分 recordings.ts**：将 batch-replay 逻辑提取到独立 service
3. **WS 消息 Zod 校验**：在 index.ts onmessage 中添加 `AgentMessageSchema.safeParse()`
4. **路由输入校验**：PATCH executions、DELETE batch 添加 Zod schema
5. **更新过期文档**：CLAUDE.md 移除「脚手架」描述，删除或缩减 GEMINI.md
6. **.gitignore 补充**：添加 `.env`、`dist/`、`*.log`

### 短期目标（下个迭代）

7. **补全核心测试**：ReplayEngine、RecorderManager、RecordingsRouter
8. **UUID 路径参数校验**：所有路由统一中间件
9. **文件路径清理**：storage service 添加路径解析和前缀检查
10. **常量命名修正**：`browserLaunchers` → `BROWSER_LAUNCHERS`
11. **WS 消息过滤**：前端 addEventListener 支持按 recordingId 过滤

### 中长期目标

12. **E2E 集成测试**：server→agent→worker→browser→frontend 关键链路
13. **WebSocket 认证**：Token 校验 + Origin 检查
14. **安全头中间件**：X-Content-Type-Options、HSTS、CSP
15. **组件级 UI 测试**：录制列表、回放面板、步骤列表
16. **类型系统完善**：PendingTask 改为 discriminatedUnion、移除 all `Record<string, any>`
