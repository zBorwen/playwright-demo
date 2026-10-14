# 按需 SDD 与执行证据

准备开发时先确认项目 routes 的初始化标记；未初始化按 portable.md 分析一次并填写约定和路由，已有 ready 配置不重复扫描。校验拒绝未初始化的任务记录。

## 规格与自主路径

小修改在对话内写清预期、范围和验收即可。功能/行为变更/重构维护 `docs/specs/<domain>.md`，包含目标、非目标、REQ 与验收、必要设计；沿用既有相关规格，不为每步建文件。
Spec 的要求来自用户目标与实际必要约束，不穷举未来场景。Bug 以恢复预期行为为目标，重构明确行为不变量。范围确认后连续推进，不重复要求确认普通细节。
用户变更要求时暂停受影响工作，同步规格和证据；发现未经确认的破坏性操作先停，不因“已在执行”直接继续。模型可以反复调查、实现、测试，不要求固定线性顺序。

## 路由与技能

`workflow/routes.yaml` 是模块/意图到资料的唯一索引。`python3 scripts/workflow.py route <文件...>` 给出按路径的最低资料集合；语义调用方由模型补充。未知路径显式输出。
普通需求只做必要澄清；完整 grilling 仅用户要求深入质疑时使用。ponytail 贯穿最小范围的沟通、实现和审查；不能削减实际安全边界。

## 任务状态

较大任务使用 `workflow/tasks/<id>.yaml`。问答、调查与简单小改不强制创建。
新任务从 workflow/templates/task.yaml 复制并填入真实数据，Spec 可参考 workflow/templates/spec.md；phase 为 scoped / implementing / verifying / reviewing / done / paused，表示里程碑而非固定流水线。允许回退。
kind 为 small / bug / feature / refactor，risk 为 low / normal / high。高风险覆盖类型判断。
base_commit 保存任务开始时的完整提交 SHA，必须为当前 HEAD 的祖先；校验覆盖该基准至当前工作区（已提交、暂存、未暂存、未跟踪），任务中途提交不会缩短范围。基准不存在或不合法时失败，不回退到 HEAD。
scope 列出任务负责的全部文件（包括新文件与删除路径）；context 列相关资料及使用理由；unknown_paths 对路由未覆盖的任务文件说明调查结果。无关改动列入 excluded_changes 并解释，不覆盖它们。
普通任务默认新增/更新 Spec、任务 YAML、HANDOFF；不为每步创建单独报告或开发笔记。
checks 包含 design、verification、review：status 为 pending / passed / failed / na / waived，配 reason；passed 默认配 report 简短实际证据和 fingerprint 摘要；design/review 另有 reviewer 标识。report 包含范围、执行的命令/检查、实际结果和必要限制。仅长日志/大型审查才改用 evidence 文件路径，不同时重复维护两种记录。既有历史文件证据仍可读取。
- 实施前：refactor/high 的 design 必须 passed，或有用户明确豁免的引用证据。
- 任何检查实际为 failed 时，都不能标记 done；不要求执行不等于可以忽略已经发现的问题。
- 完成前：verification 必须 passed；普通任务及 refactor/high 的 review 必须 passed；small/low、bug/low 可 na，但要解释。
- 用户明确接管/免除 review：用 waived + 用户决定证据文件，不能写 passed。不会自动豁免验证。
- 验收独立为 acceptance: pending / accepted / na。done 表示工程完成，不自动代表用户接受；accepted 必须有用户反馈证据。

`python3 scripts/workflow.py check workflow/tasks/<id>.yaml` 检查记录与当前工作区；未知枚举、缺少资料、未覆盖改动、完成证据缺失或摘要过期均失败。
`python3 scripts/workflow.py fingerprint workflow/tasks/<id>.yaml design|implementation` 产生摘要。design 绑定规格；implementation 绑定 scope 中实现/规格文件的内容和路径，包含未跟踪文件与删除状态。状态和 evidence 不得纳入 scope，防止摘要自引用。证据文件本身不作为实现摘要的一部分。唯一额外排除是根目录 HANDOFF.md 的接续信息：它仍在 scope 中用于范围核对，但不参与 implementation 摘要；不提供任意文件排除开关，Spec 和代码仍严格绑定。HANDOFF 不承载需求或长期规则。
完成后实现变更会使证据失效；回到相应阶段补验/补审。范围或预期变化时也要判断设计结论是否失效，不仅依赖摘要。

## 独立审查

普通开发一次最终 review；重构/high 在实施前审设计，实施后审实际变更与受影响调用方。小改自检不强制额外代理。
reviewer 与实现者分离，默认只读。reviewer 返回范围、基准、证据、问题和结论，主 Agent 原样摘要到任务 checks.review.report 并记录 reviewer；不默认再创建报告文件。独立审查必须实际发生，字段本身不能证明独立性。子 Agent 可以并行调查/开发，但主 Agent 负责整合和验证，不能伪造独立通过。
检查器能检查报告存在、非空及版本关联，不能证明 reviewer 身份、内容真实性或理解程度。这些需实际工具记录与人工核查。

## 知识和交接

HANDOFF 恰好一个“## 当前任务”段落，只链接一份当前任务 YAML，并引用 Spec、补充决定/阻塞/下一步。新任务替换当前段落，旧任务移到“历史任务”下仅保留链接；不能堆叠多个“当前任务”。校验会检查唯一性和任务对应。并行子任务记录在主任务 YAML 中，子 Agent 不分别追加当前任务；由主 Agent 整合。状态以 YAML 为准。迁移前的旧计划保留到项目历史归档；HANDOFF 只保留历史入口，按需读取，不默认授权执行。
后续明确的新待办放 HANDOFF 的待办池；完成事项不再重复维护在多个文件。历史快照不批量“修正”为当下事实。
项目开发笔记记录已确认技术约束，Bug 记录保留有复用价值的根因；使用/测试/部署变了才更新路由索引对应的指南。无需每次修改都写日志。新增测试不自动扩写测试指南，普通功能命令与结果只记录于任务 YAML。
恢复时核对 Git 分支/HEAD/未提交变更及任务证据，不能盲信交接。禁止记录密钥。

## 校验能力与环境

Python 3 + PyYAML：依赖见 `scripts/requirements-workflow.txt`。使用 safe_load；不执行 YAML 内容。
`python3 -m unittest discover -s scripts -p 'test_workflow*.py'` 运行针对性测试。
校验只检查当前记录和证据条件，不记录不可篡改的状态转换历史；它不阻止直接调用编辑工具，也不替代 CI/宿主权限门禁。本次不接管提交/合并，不声称有已部署的硬拦截。

历史任务 YAML 与报告保留当时证据，不为后续变更改写 passed 或重新计算旧摘要。新任务使用新的记录和开始基准；旧记录缺少新增字段时不能作为当前校验输入，查验历史版本使用对应 Git 提交。
