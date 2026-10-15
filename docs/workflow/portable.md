# 移植到其他项目

这套流程适用于有初始提交的 Git 项目，与业务语言无关。工具需要 Python 3.9+、PyYAML 6.x 和 Git；当前任务基准使用常规 SHA-1 提交。它检查记录和证据关联，不是宿主工具权限门禁。

## 接入核心迁移分支

本分支已经是通用核心，无需运行导出器。下载本分支文件后按原相对路径接入目标项目；README 仅作迁移说明，不覆盖目标 README。
目标已有 AGENTS 或同名工具/文档时，先合并有效工程约束，再同步通用流程。保留目标的 routes.yaml、conventions.md、业务 Spec、任务与知识记录。不要复制来源项目的历史任务。
首次接入且配置不存在时，才从 workflow/templates/routes.yaml 和 conventions.md 复制到 workflow/routes.yaml 与 docs/workflow/conventions.md，由 Agent 分析后填写。已有配置不覆盖成空模板。
通用核心不携带默认根 HANDOFF。实际交接时才从模板创建快照。

**初始化由 Agent 分析后填写两处，不要求用户手填：**

1. `docs/workflow/conventions.md`：填写目标项目实际技术栈、启动/测试/检查命令、代码规范与数据边界，不复制来源项目的 Node、pnpm 或组件约定。
2. `workflow/routes.yaml`：按目标模块填写 `prefixes` 和必要 `docs`；保留目标项目已有知识文档名称。没有映射的路径会被报告为未知，不用全路径兜底来掩盖遗漏。`intent_docs` 供 Agent 按意图读取，CLI route 当前只按路径匹配。

其余通用入口、流程、状态校验保持同一结构。不要复制来源仓库的 `workflow/tasks`、`workflow/evidence`、业务 Spec 或历史 HANDOFF。

## 一次性项目初始化

首次接入、用户明确要求初始化，或首次开发发现 project.status 为 uninitialized 时，由 Agent 执行。纯问答按需查资料，不触发完整初始化。

1. 核对目标目录、Git HEAD 和未提交变更；先识别现有约束，不覆盖未知修改。
2. 读取顶层目录、实际依赖/构建清单、README、已有工程规范；按目录定位核心入口和主要模块。现有知识文档先看标题/目录，仅补读需要确认的章节，不做全库审计或通读全部 Bug 历史。
3. 在 conventions.md 填入实际项目职责、技术栈、模块边界、启动/测试/检查命令及读取依据；未知项明确标记，不能猜。命令仅查到定义时写“已核实定义、未执行”，不主动安装依赖、启动服务、迁移或部署。
4. 在 routes.yaml 按真实模块建立必要文档映射，intent_docs 指向目标项目已有的启动/测试/知识资料；缺少某类资料可暂指向 conventions 中已核实的内容，不强制创建同名文档。
5. 保留目标项目已有任务与交接信息，不自动改写其状态。导出包仅提供交接模板，不创建根 HANDOFF；只有实际交接时才生成快照。旧知识只建索引。
6. 核对引用存在，用 route 检查代表性模块；完成后将 project.status 写为 ready，analyzed_commit 写入本次分析时的 git rev-parse HEAD。未解决的核心约束或无法访问必要资料时保持 uninitialized，简短说明阻塞。初始化结果摘要直接回复，不额外生成初始化报告。

ready 是 Agent 的完成声明，校验器只能检查标记与基准格式，不能证明理解正确。analyzed_commit 用于追溯，HEAD 变化不会自动触发全量重分析；后续仅在技术栈、命令、模块或相关知识变化时更新受影响配置。没有初始 Git 提交时暂不能使用任务基准校验，需先完成项目自己的 Git 初始化。

## 验证安装

在目标仓库运行：

```bash
python3 -m pip install -r scripts/requirements-workflow.txt
python3 -m unittest discover -s scripts -p 'test_workflow*.py'
python3 scripts/workflow.py route 实际模块文件路径
```

依赖安装遵循目标项目的虚拟环境约定。导出器本身不安装依赖。包内核心测试不要求前端、数据库或业务服务。

## 开始第一个任务

问答和小改仍不创建任务。项目初始化完成后，确需保存进度或证据时：

- 先判断是否有重要未决取舍。必要时先对齐，只有值得长期保留才用 Spec 模板；明确任务不强制写 Spec。
- 复制 `workflow/templates/task.yaml` 到 `workflow/tasks/<id>.yaml`，填写真实 id、目标、范围和资料；把 `git rev-parse HEAD` 的结果填入 base_commit，不保留模板占位符。
- 仅在有记录需求时创建任务 YAML：直接填写 criteria，或引用已有 Spec。不要重复维护。模板没有分类/等级，也不默认启动 design/review。没有记录需求就直接实施并回复验证结果。需要实际交接时才生成 HANDOFF。
- 实际执行后内联验证结果，以及确实选择的独立审查结果，再用 fingerprint/check 命令校验；不得把模板填成虚假的通过记录。

例如记录建立后（将示例 id 换成实际值）：

```bash
python3 scripts/workflow.py fingerprint workflow/tasks/example.yaml implementation
python3 scripts/workflow.py check workflow/tasks/example.yaml
```

## 技能与维护边界

包不附带第三方技能或本机模型设置。目标环境已有 ponytail/grilling 时按入口调用；缺少时说明能力缺失，先遵循入口的最小必要原则，不能声称调用过技能或独立 reviewer。不要为普通任务自动安装插件。

只有跨项目规则改变时更新核心；目标项目知识、模块路径和工具命令留在项目配置。已有项目无需为迁移补写全部历史 Spec。
已验证范围是本机不同 Git 目录布局中的导出、路由和校验；其他操作系统或 Agent 宿主仍需当地验证。

## 从旧版升级

同步 AGENTS、change.md、校验器、测试和模板；保留项目 routes/conventions 及真实任务。删除旧流程中“风险/重构自动前置审查”“每个任务必须 HANDOFF”的要求。若公司有单独 reviewer agent 文件，也需引用新审查标准，不继续套用实现完成证据审设计。旧报告保留，按 change.md 的升级规则核对证据，不凭新摘要伪造通过。

分类不等于流程选择。升级时也移除旧版“普通开发必建 Spec/YAML、普通功能必 review”的触发；已明确或已选择的检查仍需完成，不能把可选误当成随意跳过。
