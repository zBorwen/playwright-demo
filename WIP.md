# WIP — 中短期开发计划

> 最后更新：2026-06-12（基于项目风险全面复查）

## 已完成

- [x] Monorepo 基础设施（pnpm workspace + shared 包）
- [x] Server 基础设施（Hono + PostgreSQL + WebSocket）
- [x] Agent 基础 + Recorder（playwright-core + 元素指纹）
- [x] WebSocket 消息路由 + 端到端录制流程
- [x] Frontend 基础设施（React + Vite + Tailwind dark + Zustand）
- [x] 项目列表页 + 创建功能
- [x] 录制列表页 + 录制表单
- [x] 项目详情页
- [x] 录制详情页（操作序列时间线 + WebSocket 实时更新）
- [x] 执行详情页（状态、耗时、错误信息、截图展示）
- [x] 执行历史可点击跳转
- [x] 录制 JSON 编辑器（标签页切换 + 格式化 + 保存）
- [x] HAR Mock 回放（引擎 + 前端开关 + 服务端路由）
- [x] Zustand 状态管理（projects、recordings、executions）
- [x] Recorder 使用 playwright-core 内部 API（_enableRecorder + eventSink）
- [x] Fill 操作值截断 / 多次显示 / 顺序错乱 / 数据覆盖 修复
- [x] Assert 操作支持（assertText、assertVisible、assertChecked、assertValue、setInputFiles）
- [x] Codegen 展示 tab + 实时推送 + 服务端回退
- [x] Zod validator passthrough 修复动作数据丢失
- [x] Recorder 系统架构文档 + 修复总结文档
- [x] Network/HAR 功能：录制捕获 → 过滤静态资源 → DB 存储 → 前端 Network tab → Mock 规则编辑 → 回放 Mock 路由
- [x] 代码质量优化：清理死代码、修复空 catch、修复 artifact 删除误删、统一 import 位置、移除未使用状态
- [x] 测试覆盖率提升（包含 shared, agent, server, frontend 的核心逻辑测试）
- [x] 项目质量修复：消除全部 any 类型（agent 7 处 + shared 1 处）、安全加固、架构优化、文档同步
- [x] 回放自愈功能 Phase A（selector-healer 策略生成 + replay-engine 集成 + 单元测试）
- [x] WebSocket 连接安全加固（Agent 消息 Zod 校验 + Token 认证）
- [x] 路由参数 UUID 校验中间件（全部 `/:id` 路由）
- [x] WebSocket 录制广播数据隔离（前端按 recordingId 过滤 record:action 消息）
- [x] 路径遍历防护（storage.ts sanitizeId + resolveSafe）
- [x] 错误信息脱敏（全局 error handler 返回通用消息）
- [x] 安全头补充（X-Content-Type-Options、X-Frame-Options）
- [x] GEMINI.md 重复文档删除、CLAUDE.md 文档清单更新
- [x] 修复全部 7 个安全与稳定性风险（R1-R7，包括任意文件读取防御、deleteRecording 纵深防御、类型加固、全局异常处理、safeSend 防止崩溃、ZodError 信息精简、replaySpeed 运行时校验）

## 进行中 / 待排期

### 🔴 高优先级（安全 / 核心测试）

- [ ] **补全 HSTS + CSP 安全头**：app.ts 当前仅有 X-Content-Type-Options + X-Frame-Options
- [ ] **WS 强制认证**：当前仅当 AGENT_TOKEN 环境变量设置时才校验，未设置时等同于开放
- [ ] **ServerMessage schema 补全**：protocol.ts 仅定义 4 种变体，缺少 batch-replay:start、batch-replay:result、error 等
- [ ] **ReplayEngine 单元测试**（engine.ts 397 行，12 种 action 回放 + 自愈逻辑，零覆盖）
- [ ] **RecorderManager 单元测试**（manager.ts 228 行，录制生命周期 + fill 合并 + codegen 累积，零覆盖）
- [ ] **recordings routes 测试**（recordings.ts 300 行，8 个 API 端点 + 批量回放编排，零覆盖）

### 🟠 中优先级

- [ ] **录制漏记遮罩层点击修复**（BUG_LOG 已定位根因：Playwright api 模式对纯 div 不敏感，需注入脚本补录）
- [ ] **前端 WS 消息过滤**：subscribeToMessages 全局广播无 recordingId/executionId 过滤
- [ ] **context.ts 模块级单例重构**：`let wsHandlers` 并发安全隐患
- [ ] **回放步骤实时截图推送到前端**（通过 WebSocket 推送截图到前端）
- [ ] **Docker Compose 一键启动**
- [ ] **executions routes 测试**（132 行，零覆盖）

### 🟡 低优先级

- [ ] **engine.ts 残留 as any 修复**（第 313 行，RecordingAction 本身有 selector 字段）
- [ ] **frontend api.ts 类型去重**：Project/Recording/Execution 等类型在 shared 包已定义
- [ ] **network routes 测试**（81 行，零覆盖）
- [ ] **自愈集成测试深度补强**（当前仅 1 个 selector 差异验证）

## 测试状态

| 包 | 测试文件 | 用例数 | 核心缺口 |
|------|----------|--------|----------|
| shared | 3 | 14 | ✅ 全部通过 |
| agent | 7 | 27 | 🔴 ReplayEngine / RecorderManager 零覆盖 |
| server | 4 | 12 | 🔴 recordings / executions / network routes 零覆盖 |
| frontend | 4 | 19 | ⚠️ 无组件级 UI 测试 |
| **合计** | **18** | **72** | 🔴 无 E2E 集成测试 |

## 最近提交

- `a9c1cc1` fix: 路由参数UUID校验与WebSocket录制广播数据隔离
- `697decf` feat: 实现回放自愈功能与WebSocket连接安全加固
- `7768f13` 删除prompt
- `87094a6` refactor: 项目质量修复 — 消除 any 类型、安全加固、架构优化、文档同步
- `9d65f87` test: 补全核心逻辑单元测试并重构前端测试环境
