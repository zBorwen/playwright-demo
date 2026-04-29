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

## 进行中 / 待排期

- [ ] 录制器集成 playwright-core 内部 API（当前使用注入 JS 事件监听）
- [ ] 测试覆盖率提升（server routes、agent replay engine 端到端测试）
- [ ] 部署配置（Dockerfile、环境变量文档）
- [ ] 回放步骤实时截图展示（通过 WebSocket 推送截图到前端）

## 测试状态

| 包 | 测试数 | 状态 |
|---|---|---|
| shared | 6 | ✅ |
| agent | 5 | ✅ |
| server | 1 | ✅（仅 health check） |

## 最近提交

- `28894db` docs: add README and WIP with current progress status
- `b1eab1a` feat: wire up mock mode toggle for replay with server and agent support
- `c0a7a16` feat: add HAR mock playback support to replay engine
- `177e802` feat: enhance execution detail with duration, artifacts, and screenshots
- `3f9d857` feat: add recording JSON editor with tab navigation
- `5256898` feat: 添加执行详情页面和执行历史可点击跳转
