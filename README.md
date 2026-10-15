# 通用 Agent workflow 核心

这个分支只包含可迁移的规则、工具和模板，没有来源项目业务代码、历史任务或项目知识。核心来自 `codex/sdd-workflow` 的 `ce4e816`。

## 已接入的公司项目：升级

将本分支内容按相对路径接入。不要用本 README 覆盖公司项目 README。

- `AGENTS.md`：合并保留公司有效工程/安全约束，替换旧的固定编排规则。
- `docs/workflow/change.md`、`portable.md`：同步通用规则。
- `scripts/workflow.py`、`test_workflow.py`、`requirements-workflow.txt`：同步校验工具与测试。
- `workflow/templates/`：同步模板，不把空白配置覆盖到项目配置。

保留公司已有的 `workflow/routes.yaml`、`docs/workflow/conventions.md`、业务 Spec、任务、证据及真实交接记录。若存在自定义 reviewer agent 指令，也按 change.md 同步审查阶段和阻塞标准。

升级不需要重新分析整个项目。仅补齐这次变化影响的配置与规则，旧校验记录按 portable.md 的升级说明处理，不伪造新摘要为已验证。

## 首次接入

请 Agent 阅读 AGENTS.md 和 docs/workflow/portable.md，分析目标项目一次。缺少配置时，才复制：

- `workflow/templates/routes.yaml` → `workflow/routes.yaml`
- `workflow/templates/conventions.md` → `docs/workflow/conventions.md`

由 Agent 根据真实项目填写约定与文档路由，再标记初始化完成。不要把空模板直接标为 ready。

## 验证

按项目的 Python 虚拟环境约定准备依赖，然后执行：

```bash
python3 -m pip install -r scripts/requirements-workflow.txt
python3 -m unittest discover -s scripts -p 'test_workflow*.py'
```

没有任务记录时不用为运行校验而创建记录。明确任务直接实施和验证；关键取舍才先对齐，必要时才写 Spec，实际交接才用 HANDOFF。

这个分支是独立模板快照。复制/合并所需文件即可，不需要将来源项目的提交历史合并进公司仓库。包不安装外部技能或改变模型配置。
