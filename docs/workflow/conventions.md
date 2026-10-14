# 工程约定

修改代码、提交或部署时按需读取对应章节；纯问答和单纯文案/CSS 值调整无需通读。

- 默认中文交流、文档、注释和提交信息，专有词保留原文。
- Node.js >= 24，包管理器 pnpm，默认 TypeScript。

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

