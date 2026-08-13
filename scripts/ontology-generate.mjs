#!/usr/bin/env node
/**
 * ontology-generate.mjs
 * 从 ontology/project-ontology.yaml 生成全部项目文档。
 * 运行：pnpm docs:gen
 * 原则：本体是唯一事实源，生成的文档禁止手工编辑。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const ONTOLOGY_PATH = resolve(ROOT, 'ontology/project-ontology.yaml')
const ONTOLOGY = YAML.parse(readFileSync(ONTOLOGY_PATH, 'utf8'))

// ---------- 工具 ----------

const banner = (file) =>
  `<!-- ⚠️ 本文件由 ontology/project-ontology.yaml 自动生成，禁止手工编辑。修改请编辑本体后运行 pnpm docs:gen（目标：${file}） -->\n\n`

const bullet = (arr) =>
  (Array.isArray(arr) ? arr : [arr]).map((x) => `- ${x}`).join('\n')

const header = (level, text) => `${'#'.repeat(level)} ${text}`

// ---------- 模板 ----------

function renderReadme(o) {
  const k = o.knowledge
  return [
    banner('README.md'),
    header(1, `${k.project.title} — ${k.project.subtitle}`),
    '',
    k.project.description,
    '',
    header(2, '架构'),
    '',
    '```',
    ...k.project.architecture,
    '```',
    '',
    ...k.project.features.map((f) => `- ${f}`),
    '',
    header(2, '快速开始'),
    '',
    '```bash',
    ...k.project.quickstart.map((q) => `# ${q}`),
    '```',
    '',
    header(2, '技术栈'),
    '',
    '| 层 | 技术 |',
    '|---|------|',
    ...Object.entries(k.techStack).map(([layer, tech]) => `| ${layer} | ${tech} |`),
    '',
    header(2, '测试'),
    '',
    '```bash',
    ...k.testing.commands,
    '```',
    '',
    '测试策略与覆盖率目标详见 [TESTING.md](TESTING.md)。',
    '',
    header(2, '本体驱动文档'),
    '',
    `本仓库的文档体系以 **ontology/project-ontology.yaml** 为唯一事实源。`,
    '',
    `- 本体：\`ontology/project-ontology.yaml\``,
    `- 生成：\`pnpm docs:gen\``,
    `- 校验：\`pnpm ontology:check\``,
    '',
    `生成文档清单：${o.meta.generated.map((f) => `\`${f}\``).join('、')}。`,
    '',
  ].join('\n')
}

function renderConstraints(o, agent) {
  const p = o.properties
  const isGemini = agent === 'gemini'
  const headerNote = isGemini
    ? 'Gemini CLI 项目约束（由本体自动生成，与 CLAUDE.md 同源）'
    : '项目级约束（由本体自动生成）'
  return [
    banner(isGemini ? 'GEMINI.md' : 'CLAUDE.md'),
    header(1, o.knowledge.project.title),
    '',
    headerNote,
    '',
    o.knowledge.project.description,
    '',
    header(2, '本体声明'),
    '',
    '本文件是 `ontology/project-ontology.yaml` 的生成视图。所有约束的唯一事实源是本体文件，修改约束请编辑本体后运行 `pnpm docs:gen`。',
    '',
    header(2, '语言规范'),
    '',
    bullet(p.language.rules),
    '',
    header(2, '环境约定'),
    '',
    bullet([
      `Node.js ${p.environment.node}，${p.environment.nodeNote}`,
      `包管理器使用 ${p.environment.packageManager}`,
    ]),
    '',
    header(2, '文档体系'),
    '',
    '### 文档原则',
    '',
    bullet([
      '只保留必要文档',
      '内容精准、及时更新',
      '重要信息精确精简，避免冗余',
      '所有文档由本体生成，禁止手工编辑生成物',
    ]),
    '',
    '### 文档清单',
    '',
    '| 文件 | 用途 | 模板 |',
    '|------|------|------|',
    ...Object.entries(o.documents).map(
      ([file, d]) => `| \`${file}\` | ${d.purpose} | \`${d.template}\` |`,
    ),
    '',
    header(2, '开发流程'),
    '',
    o.process.devFlow.map((s, i) => `${i + 1}. ${s}`).join('\n'),
    '',
    header(2, '本体维护流程'),
    '',
    o.process.ontologyFlow.map((s, i) => `${i + 1}. ${s}`).join('\n'),
    '',
    header(2, '代码规范'),
    '',
    bullet([
      `默认使用 ${p.code.language}，类型写完整，禁止 \`any\``,
      p.code.noJsdoc,
    ]),
    '',
    '### 命名规则',
    '',
    '| 目标 | 规则 |',
    '|------|------|',
    `| 变量和函数 | \`${p.naming.variable}\` |`,
    `| 类和接口 | \`${p.naming.class}\` |`,
    `| 常量 | \`${p.naming.constant}\` |`,
    `| 文件和目录 | \`${p.naming.file}\` |`,
    ...(p.naming.avoidAbbreviations
      ? ['| 缩写 | 避免（广泛认可的除外） |']
      : []),
    `| 函数 | ${p.naming.functionVerb} |`,
    `| 类 | ${p.naming.classNoun} |`,
    `| bool | ${p.naming.booleanPrefix} |`,
    `| 图标组件 | ${p.naming.iconComponent} |`,
    `| 函数声明 | ${p.naming.functionDecl} |`,
    `| SVG | ${p.naming.noInlineSvg} |`,
    '',
    `- 单组件/库/脚本不超过 ${p.limits.maxLinesPerFile} 行，尽量控制在 ${p.limits.preferredLinesPerFile} 行附近`,
    '',
    header(2, 'Git 规范'),
    '',
    '### 提交信息',
    '',
    bullet([
      `格式：\`<类型>: <简短描述>\`，类型 \`feat\` / \`fix\` / \`docs\` / \`refactor\` / \`test\` / \`chore\``,
      `描述不超过 ${p.limits.commitSubjectMaxChars} 字，只说做了什么，不说怎么做的`,
      '如有必要，空一行后补充详细说明',
    ]),
    '',
    '### 分支',
    '',
    bullet([
      '主分支：`main`，保持稳定可运行',
      '功能分支：`<类型>/<简短描述>`，如 `feat/user-login`、`fix/snapshot-bug`',
      '完成后合并回 `main`，避免直接 push 到 `main`',
    ]),
    '',
    '### PR',
    '',
    bullet([
      '标题与提交信息格式一致',
      '正文包含：做了什么、为什么、如何验证',
      '合并后删除远程功能分支',
    ]),
    '',
    header(2, '安全'),
    '',
    bullet([
      '不访问项目内的 `.env` 文件',
      '如需涉及 `.env` 的操作，编写脚本交由用户手动执行',
    ]),
    '',
    header(2, '包间依赖边界'),
    '',
    '| 包 | 允许依赖 |',
    '|------|------|',
    ...Object.entries(o.relations.dependsOn).map(
      ([pkg, deps]) =>
        `| \`@playwright-demo/${pkg}\` | ${deps.length ? deps.map((d) => `\`@playwright-demo/${d}\``).join('、') : '（无）'} |`,
    ),
    '',
    '违反依赖边界会被 `pnpm ontology:check` 拦截。',
    '',
    header(2, '启用的插件'),
    '',
    bullet(o.classes.Plugin.individuals.map((pl) => `**${pl}**`)),
    '',
    header(2, '文件分工'),
    '',
    bullet([
      '`CLAUDE.md` / `GEMINI.md` — 项目级别约束（由本体生成）',
      '`AGENTS.md` — 代理推理风格（由本体生成）',
      '两者互补，不重复',
    ]),
    '',
  ].join('\n')
}

function renderAgents(o) {
  return [
    banner('AGENTS.md'),
    header(1, 'Cognitive Agent Operating Model'),
    '',
    '你是一个在真实代码库中工作的编码与系统推理 agent。',
    '',
    '目标：产出正确、最小、可维护的变更，同时保持架构清晰。你不是聊天机器人，你是系统级工程助手。',
    '',
    header(2, '1. 核心操作原则'),
    '',
    '每个任务都必须被视为对活系统的变更。始终考虑：',
    '',
    bullet([
      '现有代码结构',
      '模块间依赖',
      '修改的副作用',
      '长期可维护性',
    ]),
    '',
    header(2, '2. 认知模型（强制）'),
    '',
    '所有推理必须遵循以下结构：',
    '',
    '### (1) 现象 — 现在存在什么',
    '',
    bullet(['当前行为或请求是什么', '涉及哪些文件/模块', '可观察的问题是什么']),
    '',
    '### (2) 结构 — 为什么它这样表现',
    '',
    bullet([
      '识别架构层面的原因',
      '识别耦合、状态流、依赖方向',
      '发现设计弱点或缺失的抽象',
    ]),
    '',
    '### (3) 原则 — 什么规则支配这个系统',
    '',
    bullet([
      '提取可复用的工程原则',
      '识别正确的设计模式或约束',
      '超越单次修复进行泛化',
    ]),
    '',
    header(2, '3. 执行策略'),
    '',
    '严格按此顺序：',
    '',
    [
      '理解系统状态（先读后写）',
      '识别根因（而非症状）',
      '设计最小安全变更',
      '实施变更',
      '验证无意外副作用',
    ]
      .map((s, i) => `${i + 1}. ${s}`)
      .join('\n'),
    '',
    header(2, '4. 变更哲学'),
    '',
    '### 始终优先',
    '',
    bullet([
      '最小 diff 优于大规模重构',
      '清晰优于抽象',
      '显式数据流优于隐藏魔法',
      '稳定优于炫技',
    ]),
    '',
    '### 绝不',
    '',
    bullet([
      '引入不必要的框架',
      '在没有验证复用需求时添加抽象',
      '“为了整洁”修改无关模块',
      '过早优化',
    ]),
    '',
    header(2, '5. 系统感知规则'),
    '',
    bullet([
      '始终尊重模块边界',
      '非必要不破坏公共接口',
      '修改共享逻辑前追踪依赖链',
      '除非证明未被使用，否则假定每个模块都在使用',
    ]),
    '',
    header(2, '6. 代码质量启发式'),
    '',
    '检测并消除：',
    '',
    bullet([
      '重复逻辑 → 统一',
      '过度分支 → 重设计流程',
      '隐藏状态变更 → 显式化',
      '职责不清 → 拆分模块',
      '循环依赖 → 重新分层',
    ]),
    '',
    header(2, '7. 变更安全协议'),
    '',
    '变更前验证：',
    '',
    bullet([
      '[ ] 我理解这个模块的职责吗？',
      '[ ] 什么依赖这次变更？',
      '[ ] 什么可能被间接破坏？',
      '[ ] 有没有更小的方案？',
    ]),
    '',
    '不确定 → 优先最小安全补丁。',
    '',
    header(2, '8. 输出风格'),
    '',
    '响应按此结构：',
    '',
    bullet([
      '**Understanding** — 系统中正在发生什么',
      '**Root Cause** — 为何在结构上存在此问题',
      '**Plan** — 最小安全变更策略',
      '**Implementation** — 精确的代码或 diff 级变更',
      '**Risk Check** — 可能受影响的方面',
    ]),
    '',
    header(2, '9. 深度模式（需要时触发）'),
    '',
    '以下情况激活深度分析：',
    '',
    bullet([
      '涉及多个文件',
      '需要架构决策',
      '重构非平凡',
      '行为不清晰或不一致',
    ]),
    '',
    '深度模式行动：',
    '',
    bullet([
      '在脑中追踪依赖图',
      '识别系统边界',
      '显式评估权衡',
    ]),
    '',
    header(2, '10. 关键约束'),
    '',
    '你在一个真实系统中操作。因此：',
    '',
    bullet([
      '每个变更都有后果',
      '每个抽象都必须有理由',
      '除非明确重构，否则每次修改都必须保持系统完整性',
    ]),
    '',
    header(2, '11. 最终目标'),
    '',
    '把工程任务从 "Make it work" 转变为 "Make it correct, minimal, and structurally sound within the existing system"。',
    '',
  ].join('\n')
}

function renderTesting(o) {
  const t = o.knowledge.testing
  return [
    banner('TESTING.md'),
    header(1, '测试指南'),
    '',
    header(2, '运行测试'),
    '',
    '```bash',
    ...t.commands,
    '```',
    '',
    header(2, '测试策略'),
    '',
    '| 包 | 策略 |',
    '|------|------|',
    ...Object.entries(t.strategy).map(([pkg, s]) => `| ${pkg} | ${s} |`),
    '',
  ].join('\n')
}

function renderDeployment(o) {
  const d = o.knowledge.deployment
  return [
    banner('DEPLOYMENT.md'),
    header(1, '部署指南'),
    '',
    header(2, '环境要求'),
    '',
    bullet(d.requirements),
    '',
    header(2, '本地开发'),
    '',
    '```bash',
    ...d.localDev,
    '```',
    '',
    header(2, '环境变量'),
    '',
    ...Object.entries(d.env).map(([svc, vars]) => [
      `### ${svc.charAt(0).toUpperCase() + svc.slice(1)}`,
      '',
      '| 变量 | 默认值 |',
      '|------|--------|',
      ...Object.entries(vars).map(([k, v]) => `| \`${k}\` | \`${v}\` |`),
      '',
    ]).flat(),
    header(2, '生产部署'),
    '',
    d.production.map((s, i) => `${i + 1}. ${s}`).join('\n'),
    '',
  ].join('\n')
}

// ---------- 调度 ----------

const TEMPLATES = {
  readme: renderReadme,
  constraints: renderConstraints,
  agents: renderAgents,
  testing: renderTesting,
  deployment: renderDeployment,
}

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
let allOk = true

for (const [file, def] of Object.entries(ONTOLOGY.documents)) {
  const render = TEMPLATES[def.template]
  if (!render) {
    console.error(`✗ 未知模板: ${def.template} (${file})`)
    allOk = false
    continue
  }
  const content = render(ONTOLOGY, def.agent) + '\n'
  const target = resolve(ROOT, file)
  if (checkOnly) {
    const existing = readFileSync(target, 'utf8')
    if (existing !== content) {
      console.error(`✗ ${file} 与本体不一致，请运行 pnpm docs:gen`)
      allOk = false
    } else {
      console.log(`✓ ${file} 一致`)
    }
  } else {
    writeFileSync(target, content)
    console.log(`✓ 已生成 ${file}`)
  }
}

if (checkOnly) {
  process.exit(allOk ? 0 : 1)
}
