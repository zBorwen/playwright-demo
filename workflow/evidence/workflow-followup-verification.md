# 后续修复验证

- python3 -m unittest discover -s scripts -p test_workflow.py：23 项通过。
- 新增回归：任务中途提交的 scope 外文件仍被识别；已提交、暂存、未暂存、未跟踪和删除合并覆盖；暂存变化而工作树恢复时仍识别；无效/缺失基准拒绝。
- 小任务非强制 design/review 已 failed 时不能 done；HANDOFF 更新不改变实现摘要，代码和既有 Spec 变更失效测试仍通过。
- docs/archive/legacy-planning.md 含原 WIP/TODO 完整文本，和历史提交逐字比对通过；HANDOFF 少于 30 行。
- DEV_NOTE、BUG_LOG、DEPLOYMENT 与 HEAD 字节一致。
- git diff --check 通过；本任务缺 verification/review 时 done 被拒绝。

未运行应用测试（未改应用代码）；未验证真实新会话执行。工具不充当宿主拦截器或证明模型理解。
