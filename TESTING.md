# 测试指南

## 运行测试

```bash
# 全部测试
pnpm -r test

# 单个包
cd packages/shared && pnpm test
cd packages/agent && pnpm test
cd packages/server && pnpm test
```

## 当前覆盖

| 包 | 测试文件数 | 测试数 | 范围 |
|---|---|---|---|
| shared | 3 | 14 | Zod schema 验证（actions、entities、protocol） |
| agent | 5 | 18 | 录制转换、指纹采集、Mock 路由、WS 客户端、Worker Pool |
| server | 4 | 12 | WS handlers、Projects 路由、执行服务、录制服务 |
| frontend | 4 | 19 | action-formatter、time-ago、use-local-storage、recording-replay-store |

**总计：16 个测试文件，63 个测试用例**

## 测试策略

- **Shared** — Schema 验证：输入合法/非法、默认值、类型推断
- **Agent** — 单元测试：Fingerprint JS、HAR 解析、MockRule 匹配逻辑
- **Server** — 单元测试：路由请求/响应（mock 数据库）

## 覆盖率目标

- Schema 验证：100%（已达成）
- 路由逻辑：80%+（待提升）
- Replay engine：集成测试（需要浏览器，CI 中用 Playwright 的 docker 镜像）

## Workflow 校验工具

此工具独立于应用测试，使用 Python 3 和 `scripts/requirements-workflow.txt` 的依赖。

```bash
python3 -m pip install -r scripts/requirements-workflow.txt
python3 -m unittest discover -s scripts -p 'test_workflow*.py'
python3 scripts/workflow.py check workflow/tasks/your-task.yaml
```

`your-task` 替换为 HANDOFF 指向的当前任务 ID。测试包含核心规则、项目路由及跨项目导出；导出包只携带核心测试。

校验不证明模型已理解文档，也不是编辑/合并的强制拦截器。详见 `docs/workflow/change.md`。
