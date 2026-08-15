# DESIGN-002-recorder-architecture: Recorder 系统架构文档

## Status

draft (imported)

## Spec

- Spec:

## Proposed Design

本文档描述基于 playwright-core 内部 Recorder API 的录制系统架构，输出 Timeline / Codegen / JSON 三种格式。

- **核心集成**：通过 `context._enableRecorder(params, eventSink)` 以 `recorderMode: "api"` 程序化接入，`ProgrammaticRecorderApp.run` 不弹额外窗口，事件通过 `eventSink` 回调收集。
- **内部模块复用**：`createRequire` 加载 `lib/server/recorder.js`、`recorderApp.js`、`codegen/*` 等 playwright-core 内部模块（`internal-modules.ts`）。
- **事件链路**：DOM 操作 → `__pw_recorderRecordAction` binding → Server `RecorderSignalProcessor.addAction` → `RecorderEvent.ActionAdded` → `ProgrammaticRecorderApp` → 客户端 `eventSink.actionAdded` → `RecorderManager.handleRecorderAction` → 转 `RecordingAction` + 指纹 → WS `record:action` 推送前端。
- **三种输出**：Timeline（实时动作流）、Codegen（playwright-test 代码）、JSON（可编辑序列化）。
- **元素指纹**：`captureFingerprint` 采集 data-testid/role/accessibleName/boundingBox 等字段，含 detached 元素 guard。

## Interfaces and Boundaries

- `packages/agent/src/internal-modules.ts` / `recorder-manager.ts` / `fingerprint.ts` / `index.ts`
- `packages/server/src/routes/recordings.ts`
- `packages/frontend/src/pages/recording-detail.tsx`、`recording-json-editor.tsx`
- WS 消息：`record:start` / `record:stop` / `record:action` / `record:complete` / `record:pong`

## Alternatives

- Option: 自行注入脚本监听 DOM 事件（不使用内部 Recorder API）
- Rejected because: 录制无内容，事件捕获不完整（见原文已知问题表）

## Tradeoffs and Risks

- 依赖 playwright-core 内部模块（非公开 API），版本升级可能破坏
- `recorderMode: "api"` 要求正确传参，否则会弹出 Inspector 窗口

## Links

- Plan:

## Import Metadata (migrated drafts only)

- Source path: `docs/recorder-architecture.md`
- Source hash / commit / snapshot: `02b4c356fda123fe5cec44560e86edd042a720134b6c65915704727a775564e8` @ `3570734`
- Imported by: opencode
- Imported at: 2026-08-14
