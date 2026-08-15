# AI Coding Lifecycle Index

<!-- BEGIN GENERATED metadata -->
- Ontology source: `bundled: ontology-code-lifecycle@0.1.0 (ontology 1.0.0)`
- Project root: `playwright-demo`
- Generated at: `2026-08-14T16:06:33.973Z`
<!-- END GENERATED metadata -->

<!-- BEGIN GENERATED project -->
## Project Snapshot

基于 Playwright 的浏览器自动化可视化系统。通过 Web 界面录制用户操作，回放时支持 Mock 模式，替代脆弱的 Selenium/Puppeteer 脚本。

### Technologies

- Node.js
- Monorepo (5 package manifests)
- TypeScript
- React
- Playwright
- Vite
- Hono
- Drizzle ORM
- pnpm package manager

### Commands

- `pnpm dev`
- `pnpm dev:server`
- `pnpm dev:frontend`
- `pnpm dev:agent`
- `pnpm --filter @playwright-demo/agent start`
- `pnpm --filter @playwright-demo/agent dev`
- `pnpm --filter @playwright-demo/agent test`
- `pnpm --filter @playwright-demo/frontend dev`
- `pnpm --filter @playwright-demo/frontend build`
- `pnpm --filter @playwright-demo/frontend preview`
- `pnpm --filter @playwright-demo/frontend test`
- `pnpm --filter @playwright-demo/server dev`
- `pnpm --filter @playwright-demo/server start`
- `pnpm --filter @playwright-demo/server db:generate`
- `pnpm --filter @playwright-demo/server db:migrate`
- `pnpm --filter @playwright-demo/server db:push`
- `pnpm --filter @playwright-demo/server test`
- `pnpm --filter @playwright-demo/shared test`

### Instructions

- `AGENTS.md`
- `CLAUDE.md`
- `GEMINI.md`
<!-- END GENERATED project -->

<!-- BEGIN GENERATED ontology -->
## Ontology

- Classes: `Context, Spec, Design, Plan, Task, CodeChange, TestRun, Deployment, Acceptance, Bug, BugLog, FixTask, TestEvidence, DevNote, ProjectRule, AgentAction`
- Namespaces: `docs=docs/, specs=docs/specs/, designs=docs/designs/, plans=docs/plans/, tasks=docs/tasks/, tests=docs/tests/, deploys=docs/deploys/, acceptances=docs/acceptances/, bugs=docs/bugs/, devnotes=docs/devnotes/`
<!-- END GENERATED ontology -->

<!-- BEGIN GENERATED directories -->
## Document Directories

| Directory | Purpose |
| --- | --- |
| `docs/specs/` | Spec records and templates |
| `docs/designs/` | Design records and templates |
| `docs/plans/` | Plan records and templates |
| `docs/tasks/` | Task records and templates |
| `docs/tests/` | TestRun and TestEvidence records and templates |
| `docs/acceptances/` | Acceptance records and templates |
| `docs/deploys/` | Deployment records and templates |
| `docs/bugs/` | Bug and BugLog records and templates |
| `docs/devnotes/` | DevNote records and templates |
| `docs/rules/` | ProjectRule records and templates |
<!-- END GENERATED directories -->

<!-- BEGIN GENERATED records -->
## Records

- `docs/bugs/BUGLOG-001-bug-log.md`
- `docs/deploys/DEPLOY-001-deployment-guide.md`
- `docs/designs/DESIGN-001-frontend-state-management.md`
- `docs/designs/DESIGN-002-recorder-architecture.md`
- `docs/designs/DESIGN-003-replay-state-management.md`
- `docs/designs/DESIGN-004-recorder-fix-summary.md`
- `docs/devnotes/NOTE-001-dev-notes.md`
- `docs/devnotes/NOTE-002-env-file-management.md`
- `docs/plans/PLAN-001-long-term-todo.md`
- `docs/plans/PLAN-002-wip-plan.md`
- `docs/rules/RULE-001-env-file-management.md`
<!-- END GENERATED records -->

## Chains

```text
Spec → Design → Plan → Task → CodeChange → TestRun → Deployment → Acceptance
Bug → BugLog → FixTask → CodeChange → TestRun → TestEvidence → Bug.closed
BugLog → DevNote → ProjectRule
```

This file is a generated view. The ontology YAML and ID-bearing documents are
the sources of truth.
