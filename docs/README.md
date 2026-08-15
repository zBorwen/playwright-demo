# AI Coding Lifecycle Documents

<!-- BEGIN GENERATED metadata -->
- Ontology source: `bundled: ontology-code-lifecycle@0.1.0 (ontology 1.0.0)`
- Project root: `playwright-demo`
- Generated at: `2026-08-14T16:06:33.973Z`
<!-- END GENERATED metadata -->

<!-- BEGIN GENERATED project -->
## Project

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

This directory contains project-specific lifecycle records. The ontology YAML
defines the semantics; these Markdown files record the project's instances,
decisions, execution facts, evidence, and acceptance results.

## Document Order

```text
Spec → Design → Plan → Task → CodeChange → TestRun → Deployment → Acceptance
```

```text
Bug → BugLog → FixTask → CodeChange → TestRun → TestEvidence → Bug.closed
```

Do not treat a template as a project record. Replace the `_template.md` file
with an ID-bearing document only when the corresponding work exists.

## Evidence Rule

Every completed Task, closed Bug, and passed Acceptance must point to evidence
that another Agent can inspect. Failed runs and unresolved risks remain
visible.
