# playwright-demo 本体论架构

本仓库的文档体系与代码约束以 **本体（Ontology）** 为核心构建：`ontology/project-ontology.yaml` 是**唯一事实源（Single Source of Truth）**，其余一切——项目文档、代码校验规则——都是它的派生视图。

## 为什么用本体

传统方式（`CLAUDE.md` / `GEMINI.md` / `AGENTS.md` 各自手写）有三个根本问题：

1. **多份拷贝**：同一套约束在 CLAUDE、GEMINI、AGENTS 里重复出现，改一处忘一处，必然漂移
2. **无法校验**：规则写在自然语言里，模型"自觉"遵守，没有任何机制确认是否真的遵守
3. **没有例外管理**：规则与惯例冲突时（如测试 mock 用 `any`、React 组件 PascalCase），只能靠人心里记着"这条不适用"，知识丢失

本体方式把约束变成**可查询、可执行、可继承**的知识结构：

- **类（classes）** — 概念：Package、Document、Rule、Commit、Branch、Plugin、Test、Architecture
- **属性（properties）** — 事实：语言规范、环境要求、命名规则、行数上限
- **关系（relations）** — 连接：包依赖 `dependsOn`、通信 `communicatesWith`、包含 `contains`
- **规则（rules）** — 公理：可执行（`enforceable: true`）或指导性，支持**例外（exemptions）**
- **流程（process）** — 开发流程与本体维护流程
- **知识（knowledge）** — 项目描述、技术栈、测试策略、部署信息
- **文档（documents）** — 每个文档的用途与生成模板

## 为什么用 YAML

本体文件使用 **YAML** 作为序列化格式（解析依赖 `yaml` 包）：

- **支持注释** — 每条规则、每个例外都可以记录"为什么"，这是本体维护最重要的能力
- **可读性好** — 缩进结构比 JSON 的引号/逗号友好，适合作为人工维护的事实源
- **生态惯例** — 配置与本体类文件在工程生态中普遍使用 YAML

## 架构总览

```text
ontology/
  project-ontology.yaml   ← 唯一事实源（改约束就改这里）
  README.md               ← 本说明（手写，不属于生成物）
scripts/
  ontology-generate.mjs   ← 本体 → 生成 6 份文档（README/CLAUDE/GEMINI/AGENTS/TESTING/DEPLOYMENT）
  ontology-check.mjs      ← 本体 → 校验代码（any/命名/行数/提交格式/依赖边界）
*.md                      ← 全部由生成器产出，带自动生成标记，禁止手改
```

## 工作流

```bash
pnpm docs:gen          # 本体 → 重新生成全部文档
pnpm docs:check        # 校验文档与本体是否一致（CI 用）
pnpm ontology:check    # 本体规则 → 校验代码库（exit 1 表示有错误）
pnpm ontology:check no-any   # 只跑指定规则
```

## 规则与例外：例外也是知识

本体中的每条规则都可以声明 `exemptions`（豁免路径），且豁免**必须记录理由**：

```yaml
- id: code.ts-complete-types
  description: TypeScript 类型写完整，禁止 any
  enforceable: true
  checker: no-any
  exemptions: ["**/__tests__/**"]   # 测试 mock 与断言需要宽松类型
```

当前豁免（全部记录在 `properties.naming.exceptions`）：

| 惯例 | 理由 |
|------|------|
| `__tests__/**` 目录 | 测试 mock 与断言需要宽松类型（`any`）与自由命名 |
| React 组件 PascalCase | 行业惯例（`App`、`ProjectsPage`） |
| Zod schema PascalCase | 项目惯例（`ClickActionSchema`） |
| `*.config.*` 文件名 | 生态惯例（`vite.config.ts`） |
| 测试文件 `.test` 后缀 | 测试生态惯例 |
| Node 内建 / `_` 哨兵 | `__dirname`、`_exhaustive` |
| 历史提交 | 已发生的提交不合规只记为债务（warning），新提交必须合规 |

**修改约束的正确姿势**：编辑 `ontology/project-ontology.yaml` → `pnpm docs:gen` → `pnpm ontology:check` → 提交。不要直接编辑任何 `.md`。

## 校验器支持的规则

| checker | 规则 | 级别 |
|---------|------|------|
| `no-any` | 禁止 any 类型 | error |
| `naming` | 命名规范（含惯例豁免） | warning |
| `max-lines` | 单文件 ≤ 400 行 | error |
| `commit-format` | 提交信息 `<类型>: <描述>` | error/warning |
| `dependency-boundary` | 包间依赖符合 `relations.dependsOn` | error |

## 常见问题

**Q: 生成的文档要提交到 git 吗？** 要。AI 工具（Claude Code、Gemini CLI）直接读取仓库根目录的 `CLAUDE.md` / `AGENTS.md`，它们需要存在且与本体一致（CI 用 `pnpm docs:check` 强制）。

**Q: 想让某条规则不再生效？** 删除本体中对应 rule 条目（或设 `enforceable: false`），重新生成即可——所有文档里的对应段落也会随之消失，不会留下"失效规则"的文本残留。

**Q: YAML 里含 `<` 或 `:` 的字符串需要加引号吗？** 需要。以特殊字符开头的值（如 `<类型>`）必须用引号包裹，否则 YAML 会把它当作嵌套结构解析（参见 rules 中 `git.commit-format` 的写法）。
