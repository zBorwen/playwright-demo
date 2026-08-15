# DESIGN-004-recorder-fix-summary: 录制功能修复总结

## Status

draft (imported)

## Spec

- Spec:

## Proposed Design

本文档为录制功能历史修复的技术总结（imported as Design，内容偏经验记录，后续可评估转为 DevNote）。

- **fill 值截断**：`actionUpdated` 携带累积文本，需用 `action.text` 更新 value，而非忽略参数。
- **fill 多条显示**：`actionAdded` 不再跳过 fill，`handleRecorderAction` 按 selector 去重；前端用 `actionsRef` 同步追踪，fill 按 selector 原地更新；新录制清空旧状态。
- **相同 selector 合并错乱**：仅合并**连续**的 fill（最后一个 action 也是同 selector 的 fill），非连续视为新输入会话。
- **assert 未录制**：补齐 `assertText`、`assertVisible`、`assertChecked`、`assertValue`、`setInputFiles` 五种 action 类型转换。
- **Codegen API 500**：`toActionInContext` 为所有字段提供安全默认值。
- **Zod 只存 name**：validator 添加 `.passthrough()` 保留未知字段。

## Interfaces and Boundaries

- `packages/agent/src/recorder-manager.ts`（fill 去重、action 转换）
- `packages/frontend/src/pages/recording-detail.tsx`（timeline 合并）
- `packages/server/src/services/codegen.ts` / `routes/recordings.ts`

## Alternatives

- Option: 前端无脑追加 timeline 条目
- Rejected because: 每次按键产生一条 fill 记录，timeline 膨胀

## Tradeoffs and Risks

- fill 去重依赖"连续"判定，极端输入模式下可能误判合并

## Links

- Plan:

## Import Metadata (migrated drafts only)

- Source path: `docs/recorder-fix-summary.md`
- Source hash / commit / snapshot: `22187d08d70ebeb23040b9a86ac207a9ccac43ab9eb92e40071c5a7989d9672e` @ `3570734`
- Imported by: opencode
- Imported at: 2026-08-14
