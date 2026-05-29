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
