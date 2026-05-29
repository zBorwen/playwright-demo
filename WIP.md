# WIP — 中短期开发计划

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

## 进行中 / 待排期

- [ ] 部署配置（Dockerfile、环境变量文档）
- [ ] 回放步骤实时截图展示（通过 WebSocket 推送截图到前端）

## 测试状态

各包的核心逻辑已基本覆盖单元测试，结构已优化至 `__tests__` 目录。

## 最近提交

- `refactor: 拆分 recordings route + 安全加固 + 消除 any 类型 + 文档同步`（本轮质量修复）
- `9d1fd3f` test: 补全核心逻辑单元测试并重构前端测试环境
- `ee07592` feat: 实现回放过程自动截图留证功能
- `72c8dfc` merge: 合并后端可靠性重构与协议优化分支
- `a3eb10b` feat: 增加回放前的操作步骤检查与错误提示
