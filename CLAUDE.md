# playwright-demo

基于 Playwright 的浏览器自动化可视化系统 / E2E 测试平台，已实现录制、回放、Mock、代码生成、批量回放等核心功能。

## 语言规范

- 所有由 AI 生成或修改的文档、代码注释、提交信息等，默认使用**中文**编写。
- 与用户交流默认使用中文。
- 各领域专有词汇按原语言保留。

## 环境约定

- Node.js >= 24，可直接运行 `.ts` 文件，无需 `tsc` 或 `ts-node`
- 包管理器使用 `pnpm`

## 文档

### 文档原则

- 只保留必要文档
- 内容精准、及时更新
- 重要信息精确精简，避免冗余

### 文档清单

| 文件 | 用途 |
|------|------|
| `README.md` | 项目描述和使用指南 |
| `TESTING.md` | 测试指南（运行方式、覆盖率要求） |
| `QUALITY_REPORT.md` | 项目质量与安全性审查评估报告 |
| `docs/README.md` | AI Coding 生命周期文档入口（Ontology 视图） |
| `docs/INDEX.md` | 生命周期记录索引 |
| `docs/CONTEXT.md` | 项目上下文（分支、环境、边界） |
| `docs/MAPPING.md` | 遗留文档映射状态 |
| `docs/designs/` | 技术方案设计（DESIGN-001 前端状态管理、DESIGN-002 Recorder 架构、DESIGN-003 回放状态管理、DESIGN-004 录制修复总结） |
| `docs/plans/` | 开发计划（PLAN-001 长期 TODO、PLAN-002 中短期 WIP） |
| `docs/bugs/` | Bug 与 BugLog 记录（BUGLOG-001 历史 Bug 汇总） |
| `docs/devnotes/` | 开发笔记（NOTE-001 环境与集成约定） |
| `docs/deploys/` | 部署记录（DEPLOY-001 部署指南） |

## 开发流程

1. 拿到任务 → 做计划、分解 todo → 按 Ontology 生命周期拆分为 `Plan` → `Task`（写入 `docs/plans/`、`docs/tasks/`）
2. 针对目标编写测试用例
3. 逐项完成 todo，确保测试通过，并记录 `CodeChange` → `TestRun` → `TestEvidence`
4. 需要时记录文档（`Spec` → `Design` → `Acceptance` 链条可追溯）
5. 验收完成后清理文档，重要事项并入 `docs/devnotes/`，稳定经验晋升为规则（`docs/rules/`）

## 代码规范

- 默认使用 TypeScript，类型写完整，禁止 `any`
- 不使用 JSDoc，依赖 TypeScript 类型系统
- 命名规则：
  - 变量和函数：`camelCase`
  - 类和接口：`PascalCase`
  - 常量：`UPPER_SNAKE_CASE`
  - 文件和目录：`kebab-case`
  - 避免缩写（广泛认可的除外）
  - 函数用动词或动宾短语，类用名词，bool 用 `is`/`has`/`can` 开头
- 图标组件使用 `SaveIcon` 而非 `Save`，避免歧义
- 函数声明用 `function handleXXX() {}`，不用 `const handleXXX = () => {}`
- 不内嵌 SVG，使用第三方图标库（如 lucide）
- 单组件/库/脚本不超过 400 行，尽量控制在 300 行附近

## Git 规范

### 提交信息

- 使用中文，格式：`<类型>: <简短描述>`
- 类型：`feat` / `fix` / `docs` / `refactor` / `test` / `chore`
- 描述不超过 50 字，只说做了什么，不说怎么做的
- 如有必要，空一行后补充详细说明

### 分支

- 主分支：`main`，保持稳定可运行
- 功能分支：`<类型>/<简短描述>`，如 `feat/user-login`、`fix/snapshot-bug`
- 完成后合并回 `main`，避免直接 push 到 `main`

### PR

- 标题与提交信息格式一致
- 正文包含：做了什么、为什么、如何验证
- 合并后删除远程功能分支

## 安全

- 不访问项目内的 `.env` 文件
- 如需涉及 `.env` 的操作，编写脚本交由用户手动执行

## 文件分工

- `CLAUDE.md` — 项目级别约束：技术栈、命名规范、开发流程、安全规则等
- `AGENTS.md` — 代理推理风格：分析问题的方法、输出格式、系统思维框架
- 两者互补，不重复

