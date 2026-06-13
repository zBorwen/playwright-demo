# TODO — 长期开发计划

## 近期

- [x] 录制器集成 playwright-core 内部 API
- [x] 补全 HSTS + CSP 安全头
- [ ] WS 强制认证（移除「未设 AGENT_TOKEN 则跳过」的绕过条件）
- [ ] ServerMessage schema 补全（batch-replay:start、batch-replay:result、error）
- [ ] 录制漏记遮罩层点击修复（Playwright api 模式对纯 div 不敏感）
- [ ] 回放步骤实时截图推送到前端
- [ ] Server routes 测试覆盖率 80%+
- [ ] Docker Compose 一键启动

## 中期

- [ ] 录制动作编辑（插入、删除、拖拽步骤）
- [ ] 多 Agent 管理（在线状态、版本、连接时间）
- [ ] 批量回放（按 schedule 触发）
- [x] 回放失败时的自动修复尝试（基于元素指纹匹配）— Phase A 完成
- [ ] 前端 WS 全局广播过滤（按 recordingId/executionId）
- [ ] context.ts 模块级单例重构（消除 `let wsHandlers`）

## 远期

- [ ] AI 辅助元素定位（自然语言描述 → selector）
- [x] 录制动作导出（导出为 Playwright test 代码）
- [ ] 多浏览器支持（WebKit, Firefox）
- [ ] CI/CD 集成（GitHub Actions webhook）

## 架构演进 (针对大规模并发/多租户场景)

- [ ] **分布式任务队列**：引入 Redis + BullMQ，将 Server 与 Agent 由直接 WebSocket 通信重构为生产者/消费者模式，支持多 Agent 集群横向扩展。
- [ ] **容器化隔离 (Ephemeral Containers)**：实现按需拉起 Docker/K8s Job 执行录制或回放，任务结束后自动销毁，彻底解决资源竞争与环境污染。
- [ ] **远程浏览器集群集成**：支持通过 `connectOverCDP` 连接外部高性能浏览器云（如 Browserless），实现 Agent 轻量化。
- [ ] **多租户配额管理**：建立用户级的并发 Worker 限制与公平调度算法，防止单用户霸占全局资源。
