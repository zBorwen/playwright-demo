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

## 进行中 / 待排期

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

- `9d1fd3f` fix: 修复方法名引用 createAction -> handleRecorderAction
- `44525f3` fix: fill 去重优化 + 清理调试日志 + 写入修复文档
- `cc8164e` fix: 前端 fill 操作去重，按 selector 更新而非追加
- `1679787` fix: fill 操作双重去重防护 + 日志排查
- `d7e8a4b` fix: fill 操作去重 + 支持 assert/setInputFiles 操作录制
- `b077904` fix: fill 操作只保留一条最终记录，避免每次按键都输出
- `a49145e` fix: 修复 fill 操作值截断问题，actionUpdated 更新累积文本
- `e988a74` fix: Zod passthrough 修复动作数据丢失 + codegen/时间戳容错
- `a2c11d0` fix: 修复数据回显 timeline 丰富信息/codegen/JSON 完整展示
- `77787fd` fix: 修复数据回显、回放无浏览器、codegen 非实时三个问题
