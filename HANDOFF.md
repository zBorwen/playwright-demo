# 工作交接与待办

## 当前任务：workflow 校验修复与交接减负

- 状态和证据：`workflow/tasks/workflow-followup.yaml`；规格：`docs/specs/agent-workflow.md`。
- 分支：`codex/sdd-workflow`；任务开始提交：`708234f`。接手先核对 Git 状态。
- 本次范围：任务基准覆盖已提交改动、失败检查阻止完成、历史计划归档、进度更新不使实现证据失效。
- 下一步：按任务状态检查是否仍需验证/审查；工程完成后由用户体验新会话路由。不自动提交或推送。

## 待办池

- 新会话体验：问答、单 CSS、普通功能、重构和恢复任务的真实路由，尚未验证。
- 原 WIP/TODO 已完整保存至 [历史计划快照](docs/archive/legacy-planning.md)，需要排期时再查阅并核实现状，不默认执行。

## 记录分工

任务 YAML 是当前状态来源；Spec 是行为与验收来源。HANDOFF 仅保留接续信息，不承载长期规则或实现要求；规则更新写入对应 Spec/流程文档。
上一轮任务与证据保留在 `workflow/tasks/agent-workflow.yaml` 和 `workflow/evidence/`，属于提交时的历史记录，不能当作后续改动已审查的证明。
