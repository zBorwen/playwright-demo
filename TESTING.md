<!-- ⚠️ 本文件由 ontology/project-ontology.yaml 自动生成，禁止手工编辑。修改请编辑本体后运行 pnpm docs:gen（目标：TESTING.md） -->


# 测试指南

## 运行测试

```bash
pnpm -r test
cd packages/shared && pnpm test
cd packages/agent && pnpm test
cd packages/server && pnpm test
cd packages/frontend && pnpm test
```

## 测试策略

| 包 | 策略 |
|------|------|
| shared | Schema 验证：输入合法/非法、默认值、类型推断，覆盖率 100% |
| agent | 单元测试：Fingerprint JS、HAR 解析、MockRule 匹配逻辑 |
| server | 单元测试：路由请求/响应（mock 数据库），路由逻辑覆盖率 80%+ |
| frontend | 组件/工具函数测试 |
| replayEngine | 集成测试（需要浏览器，CI 中用 Playwright 的 docker 镜像） |

