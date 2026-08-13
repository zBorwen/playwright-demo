<!-- ⚠️ 本文件由 ontology/project-ontology.json 自动生成，禁止手工编辑。修改请编辑本体后运行 pnpm docs:gen（目标：GEMINI.md） -->


# playwright-demo

Gemini CLI 项目约束（由本体自动生成，与 CLAUDE.md 同源）

通过 Web 界面录制用户操作，回放时支持 Mock 模式，替代脆弱的 Selenium/Puppeteer 脚本。已实现录制、回放、Mock、代码生成、批量回放等核心功能。

## 本体声明

本文件是 `ontology/project-ontology.json` 的生成视图。所有约束的唯一事实源是本体文件，修改约束请编辑本体后运行 `pnpm docs:gen`。

## 语言规范

- 所有由 AI 生成或修改的文档、代码注释、提交信息等，默认使用中文编写
- 与用户交流默认使用中文
- 各领域专有词汇按原语言保留

## 环境约定

- Node.js >= 24，可直接运行 .ts 文件，无需 tsc 或 ts-node
- 包管理器使用 pnpm

## 文档体系

### 文档原则

- 只保留必要文档
- 内容精准、及时更新
- 重要信息精确精简，避免冗余
- 所有文档由本体生成，禁止手工编辑生成物

### 文档清单

| 文件 | 用途 | 模板 |
|------|------|------|
| `README.md` | 项目描述和使用指南 | `readme` |
| `CLAUDE.md` | 项目级别约束：技术栈、命名规范、开发流程、安全规则等 | `constraints` |
| `GEMINI.md` | 项目级别约束（Gemini 版本，与 CLAUDE.md 同源生成） | `constraints` |
| `AGENTS.md` | 代理推理风格：分析问题的方法、输出格式、系统思维框架 | `agents` |
| `TESTING.md` | 测试指南（运行方式、覆盖率要求） | `testing` |
| `DEPLOYMENT.md` | 部署指南 | `deployment` |

## 开发流程

1. 拿到任务 → 做计划、分解 todo → 写入 WIP.md
2. 针对目标编写测试用例
3. 逐项完成 todo，确保测试通过
4. 需要时记录文档
5. 验收完成后清理文档，重要事项并入常规文档

## 本体维护流程

1. 修改约束 → 编辑 ontology/project-ontology.json
2. 重新生成文档 → pnpm docs:gen
3. 校验代码 → pnpm ontology:check
4. 提交

## 代码规范

- 默认使用 TypeScript，类型写完整，禁止 `any`
- 不使用 JSDoc，依赖 TypeScript 类型系统

### 命名规则

| 目标 | 规则 |
|------|------|
| 变量和函数 | `camelCase` |
| 类和接口 | `PascalCase` |
| 常量 | `UPPER_SNAKE_CASE` |
| 文件和目录 | `kebab-case` |
| 缩写 | 避免（广泛认可的除外） |
| 函数 | 函数用动词或动宾短语 |
| 类 | 类用名词 |
| bool | bool 用 is/has/can 开头 |
| 图标组件 | 图标组件使用 SaveIcon 而非 Save，避免歧义 |
| 函数声明 | 函数声明用 function handleXXX() {}，不用 const handleXXX = () => {} |
| SVG | 不内嵌 SVG，使用第三方图标库（如 lucide） |

- 单组件/库/脚本不超过 400 行，尽量控制在 300 行附近

## Git 规范

### 提交信息

- 格式：`<类型>: <简短描述>`，类型 `feat` / `fix` / `docs` / `refactor` / `test` / `chore`
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

## 包间依赖边界

| 包 | 允许依赖 |
|------|------|
| `@playwright-demo/shared` | （无） |
| `@playwright-demo/agent` | `@playwright-demo/shared` |
| `@playwright-demo/server` | `@playwright-demo/shared` |
| `@playwright-demo/frontend` | `@playwright-demo/shared` |

违反依赖边界会被 `pnpm ontology:check` 拦截。

## 启用的插件

- **playwright**
- **typescript-lsp**
- **context7**
- **superpowers**
- **frontend-design**
- **github**

## 文件分工

- `CLAUDE.md` / `GEMINI.md` — 项目级别约束（由本体生成）
- `AGENTS.md` — 代理推理风格（由本体生成）
- 两者互补，不重复

