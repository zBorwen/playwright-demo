# Agent 自愈能力 Implementation Plan (Phase A: MVP)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让回放引擎在元素选择器失败时自动回退到 fingerprint 备选选择器，实现测试自愈 MVP。

**Architecture:** 回放引擎 `executeActionAndWait` 捕获错误后，对交互型 action（click/fill/hover/press/select/check/uncheck/setInputFiles）调用 `tryHealAndRetry`。`selector-healer.ts` 从 `elementInfo` 生成策略元组列表 `{ strategy: 'role' | 'text' | 'css', value: any }`，回放引擎根据不同策略调用 `page.getByRole()` / `page.getByText()` / `page.locator()` 定位元素，找到后重试操作。Assert 类 action 失败不自愈。

**Tech Stack:** TypeScript, Playwright, Vitest

---

## 文件规划

| 文件 | 操作 | 职责 |
|------|------|------|
| `packages/agent/src/selector-healer.ts` | **新建** | 从 `ElementInfo` 生成策略元组列表（非纯字符串），回放引擎据此调用对应 Playwright API |
| `packages/agent/src/__tests__/selector-healer.test.ts` | **新建** | 单元测试：策略生成逻辑 |
| `packages/agent/src/replay-engine.ts` | **修改** | 新增 `tryHealAndRetry` 方法 + 修改 `executeActionAndWait` 的 catch 块 |

现有 `RecordingActionSchema` 已包含 `elementInfo` 字段，回放引擎接收的 `RecordingAction[]` 已携带 fingerprint 数据，**不需要修改 shared 包**。

---

### Task 1: Selector Healer 核心逻辑 — 策略元组生成

**Files:**
- Create: `packages/agent/src/selector-healer.ts`
- Create: `packages/agent/src/__tests__/selector-healer.test.ts`

- [ ] **Step 1: 写测试 — 验证策略元组生成**

```typescript
// packages/agent/src/__tests__/selector-healer.test.ts
import { describe, it, expect } from 'vitest';
import { generateFallbackSelectors } from './selector-healer';
import type { ElementInfo } from '@playwright-demo/shared';

describe('generateFallbackSelectors', () => {
  it('returns data-testid as first priority when available', () => {
    const elementInfo: ElementInfo = {
      dataTestId: 'submit-btn',
      dataTest: null,
      role: 'button',
      accessibleName: 'Submit',
      textContent: 'Submit',
      placeholder: null,
      id: 'form-submit',
      tagName: 'BUTTON',
      labelText: null,
      name: 'submit',
      inputType: null,
      classes: ['btn', 'btn-primary'],
      parentPath: ['form', 'div'],
      nearbyText: ['Cancel'],
      boundingBox: null,
      isVisible: true,
    };
    const strategies = generateFallbackSelectors(elementInfo);
    expect(strategies[0]).toEqual({ strategy: 'css', value: '[data-testid="submit-btn"]' });
  });

  it('generates role strategy when role and accessibleName available', () => {
    const elementInfo: ElementInfo = {
      dataTestId: null,
      dataTest: null,
      role: 'button',
      accessibleName: 'Submit',
      textContent: 'Submit',
      placeholder: null,
      id: null,
      tagName: 'BUTTON',
      labelText: null,
      name: null,
      inputType: null,
      classes: ['btn'],
      parentPath: ['div'],
      nearbyText: [],
      boundingBox: null,
      isVisible: true,
    };
    const strategies = generateFallbackSelectors(elementInfo);
    const roleStrategy = strategies.find((s) => s.strategy === 'role');
    expect(roleStrategy).toEqual({
      strategy: 'role',
      value: { role: 'button', name: 'Submit' },
    });
  });

  it('generates text strategy when textContent available', () => {
    const elementInfo: ElementInfo = {
      dataTestId: null,
      dataTest: null,
      role: null,
      accessibleName: null,
      textContent: 'Click me',
      placeholder: null,
      id: null,
      tagName: 'SPAN',
      labelText: null,
      name: null,
      inputType: null,
      classes: ['label'],
      parentPath: ['div'],
      nearbyText: [],
      boundingBox: null,
      isVisible: true,
    };
    const strategies = generateFallbackSelectors(elementInfo);
    const textStrategy = strategies.find((s) => s.strategy === 'text');
    expect(textStrategy?.value).toBe('Click me');
  });

  it('uses aria-label css selector when accessibleName exists without role', () => {
    const elementInfo: ElementInfo = {
      dataTestId: null,
      dataTest: null,
      role: null,
      accessibleName: 'Close dialog',
      textContent: null,
      placeholder: null,
      id: null,
      tagName: 'BUTTON',
      labelText: null,
      name: null,
      inputType: null,
      classes: [],
      parentPath: [],
      nearbyText: [],
      boundingBox: null,
      isVisible: true,
    };
    const strategies = generateFallbackSelectors(elementInfo);
    expect(strategies.some((s) => s.strategy === 'css' && s.value.includes('aria-label'))).toBe(true);
  });

  it('uses id css selector as fallback', () => {
    const elementInfo: ElementInfo = {
      dataTestId: null,
      dataTest: null,
      role: null,
      accessibleName: null,
      textContent: null,
      placeholder: null,
      id: 'unique-id',
      tagName: 'DIV',
      labelText: null,
      name: null,
      inputType: null,
      classes: [],
      parentPath: [],
      nearbyText: [],
      boundingBox: null,
      isVisible: true,
    };
    const strategies = generateFallbackSelectors(elementInfo);
    expect(strategies).toContainEqual({ strategy: 'css', value: '#unique-id' });
  });

  it('includes name attribute selector for INPUT elements', () => {
    const elementInfo: ElementInfo = {
      dataTestId: null,
      dataTest: null,
      role: null,
      accessibleName: null,
      textContent: null,
      placeholder: 'Enter email',
      id: null,
      tagName: 'INPUT',
      labelText: null,
      name: 'email',
      inputType: 'text',
      classes: [],
      parentPath: [],
      nearbyText: [],
      boundingBox: null,
      isVisible: true,
    };
    const strategies = generateFallbackSelectors(elementInfo);
    expect(strategies).toContainEqual({ strategy: 'css', value: 'input[name="email"]' });
    expect(strategies).toContainEqual({ strategy: 'css', value: 'input[placeholder="Enter email"]' });
  });

  it('returns empty array when no usable selectors exist', () => {
    const elementInfo: ElementInfo = {
      dataTestId: null,
      dataTest: null,
      role: null,
      accessibleName: null,
      textContent: null,
      placeholder: null,
      id: null,
      tagName: 'DIV',
      labelText: null,
      name: null,
      inputType: null,
      classes: [],
      parentPath: [],
      nearbyText: [],
      boundingBox: null,
      isVisible: true,
    };
    const strategies = generateFallbackSelectors(elementInfo);
    expect(strategies).toEqual([]);
  });

  it('returns strategies in correct priority order', () => {
    const elementInfo: ElementInfo = {
      dataTestId: 'login-submit',
      dataTest: null,
      role: 'button',
      accessibleName: 'Sign In',
      textContent: 'Login',
      placeholder: null,
      id: 'submit-id',
      tagName: 'BUTTON',
      labelText: null,
      name: null,
      inputType: null,
      classes: ['btn'],
      parentPath: ['form'],
      nearbyText: [],
      boundingBox: null,
      isVisible: true,
    };
    const strategies = generateFallbackSelectors(elementInfo);
    // Order: data-testid > role+name > text > id
    expect(strategies[0].strategy).toBe('css'); // data-testid
    expect(strategies[0].value).toBe('[data-testid="login-submit"]');
    expect(strategies[1].strategy).toBe('role'); // role + accessibleName
    expect(strategies[2].strategy).toBe('text'); // textContent
    expect(strategies.find((s) => s.value === '#submit-id')).toBeTruthy(); // id
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd packages/agent && pnpm vitest run src/__tests__/selector-healer.test.ts
```
Expected: FAIL — `selector-healer.ts` 不存在

- [ ] **Step 3: 实现 selector-healer.ts**

```typescript
// packages/agent/src/selector-healer.ts
import type { ElementInfo } from '@playwright-demo/shared';

export type FallbackStrategy =
  | { strategy: 'role'; value: { role: string; name?: string } }
  | { strategy: 'text'; value: string }
  | { strategy: 'css'; value: string };

/**
 * Generate ordered fallback strategies from an element's fingerprint.
 * Priority: data-testid > data-test > role+name > :text() > aria-label > #id > input[name] > input[placeholder]
 *
 * Caller (replay-engine) should iterate through strategies in order,
 * using the appropriate Playwright API based on the strategy type.
 */
export function generateFallbackSelectors(elementInfo: ElementInfo): FallbackStrategy[] {
  const strategies: FallbackStrategy[] = [];

  if (elementInfo.dataTestId) {
    strategies.push({ strategy: 'css', value: `[data-testid="${esc(elementInfo.dataTestId)}"]` });
  }

  if (elementInfo.dataTest) {
    strategies.push({ strategy: 'css', value: `[data-test="${esc(elementInfo.dataTest)}"]` });
  }

  if (elementInfo.role && elementInfo.accessibleName) {
    strategies.push({ strategy: 'role', value: { role: elementInfo.role, name: elementInfo.accessibleName } });
  } else if (elementInfo.role) {
    strategies.push({ strategy: 'role', value: { role: elementInfo.role } });
  }

  if (elementInfo.textContent && elementInfo.textContent.trim().length > 0) {
    strategies.push({ strategy: 'text', value: elementInfo.textContent.trim() });
  }

  if (elementInfo.accessibleName && !elementInfo.role) {
    strategies.push({ strategy: 'css', value: `[aria-label="${esc(elementInfo.accessibleName)}"]` });
  }

  if (elementInfo.id) {
    strategies.push({ strategy: 'css', value: `#${escCssId(elementInfo.id)}` });
  }

  if (elementInfo.name && elementInfo.tagName === 'INPUT') {
    strategies.push({ strategy: 'css', value: `input[name="${esc(elementInfo.name)}"]` });
  }

  if (elementInfo.placeholder) {
    strategies.push({ strategy: 'css', value: `input[placeholder="${esc(elementInfo.placeholder)}"]` });
  }

  return strategies;
}

function esc(value: string): string {
  return value.replace(/"/g, '\\"');
}

function escCssId(value: string): string {
  // CSS.escape is not available in Node.js. Escape common special chars.
  return value.replace(/([^\w-])/g, '\\$1');
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd packages/agent && pnpm vitest run src/__tests__/selector-healer.test.ts
```
Expected: PASS（所有用例通过）

---

### Task 2: 集成自愈逻辑到回放引擎

**Files:**
- Modify: `packages/agent/src/replay-engine.ts`

- [ ] **Step 1: 添加 import + 交互型 action 白名单**

在 `replay-engine.ts` 文件顶部添加 import：

```typescript
import { generateFallbackSelectors, FallbackStrategy } from './selector-healer';
```

在 `ReplayEngine` 类外（或类内 static）定义白名单：

```typescript
const HEALABLE_ACTIONS = new Set([
  'click', 'fill', 'hover', 'press', 'select', 'check', 'uncheck', 'setInputFiles',
]);
```

- [ ] **Step 2: 新增 tryHealAndRetry 私有方法**

在 `ReplayEngine` 类中添加：

```typescript
private async tryHealAndRetry(page: Page, action: RecordingAction, originalError: string): Promise<void> {
  // Only heal interactive actions
  if (!HEALABLE_ACTIONS.has(action.name)) {
    throw new Error(originalError);
  }

  if (!action.elementInfo) {
    throw new Error(originalError);
  }

  const fallbacks = generateFallbackSelectors(action.elementInfo);
  if (fallbacks.length === 0) {
    throw new Error(originalError);
  }

  console.log(`[replay] selector "${action.selector}" failed. Attempting heal with ${fallbacks.length} fallback(s)...`);

  for (const fb of fallbacks) {
    try {
      const locator = this.resolveLocator(page, fb);
      await locator.waitFor({ state: 'attached', timeout: 5000 });

      console.log(`[replay] heal successful with ${fb.strategy} (${JSON.stringify(fb.value)})`);
      await this.replayActionWithLocator(page, action, locator);
      return;
    } catch {
      continue;
    }
  }

  throw new Error(originalError);
}

private resolveLocator(page: Page, fallback: FallbackStrategy) {
  switch (fallback.strategy) {
    case 'role':
      return page.getByRole(fallback.value.role as Parameters<typeof page.getByRole>[0], {
        name: fallback.value.name,
      });
    case 'text':
      return page.getByText(fallback.value);
    case 'css':
      return page.locator(fallback.value);
  }
}

private async replayActionWithLocator(page: Page, action: RecordingAction, locator: ReturnType<typeof page.locator>): Promise<void> {
  switch (action.name) {
    case 'click':
      await locator.click({ button: action.button, timeout: 10000 });
      break;
    case 'fill':
      await locator.fill(action.value, { timeout: 10000 });
      break;
    case 'hover':
      await locator.hover({ timeout: 10000 });
      break;
    case 'press':
      await locator.press(action.key, { timeout: 10000 });
      break;
    case 'select':
      await locator.selectOption(action.options, { timeout: 10000 });
      break;
    case 'check':
      await locator.check({ timeout: 10000 });
      break;
    case 'uncheck':
      await locator.uncheck({ timeout: 10000 });
      break;
    case 'setInputFiles':
      await locator.setInputFiles(action.files, { timeout: 10000 });
      break;
  }
}
```

- [ ] **Step 3: 修改 executeActionAndWait — 在 catch 块中调用自愈**

修改后的完整方法：

```typescript
private async executeActionAndWait(page: Page, action: RecordingAction): Promise<void> {
  const needsNavigation = action.name === 'click' ||
    (action.name === 'press' && action.key === 'Enter');

  if (needsNavigation) {
    const navPromise = page.waitForNavigation({ timeout: 1000 }).catch(() => null);
    try {
      await this.executeAction(page, action);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await this.tryHealAndRetry(page, action, errorMsg);
    }
    const navResult = await navPromise;
    if (navResult) {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
    }
  } else {
    try {
      await this.executeAction(page, action);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await this.tryHealAndRetry(page, action, errorMsg);
    }
  }
}
```

- [ ] **Step 4: 编译/类型检查确认无报错**

```bash
cd packages/agent && npx tsc --noEmit
```

Expected: No errors

---

### Task 3: 端到端验证

**Files:**
- Create: `packages/agent/src/__tests__/replay-healing.test.ts`

- [ ] **Step 1: 创建集成测试 — 验证策略与原始选择器不同**

```typescript
// packages/agent/src/__tests__/replay-healing.test.ts
import { describe, it, expect } from 'vitest';
import { generateFallbackSelectors } from '../selector-healer';
import type { ElementInfo } from '@playwright-demo/shared';

describe('replay healing integration', () => {
  it('generates selectors that differ from fragile CSS selector', () => {
    const elementInfo: ElementInfo = {
      dataTestId: 'login-submit',
      dataTest: null,
      role: 'button',
      accessibleName: 'Sign In',
      textContent: 'Login',
      placeholder: null,
      id: null,
      tagName: 'BUTTON',
      labelText: null,
      name: 'login',
      inputType: null,
      classes: ['btn', 'btn-primary'],
      parentPath: ['form', 'div', 'main'],
      nearbyText: ['Forgot password?'],
      boundingBox: { x: 100, y: 200, width: 120, height: 40 },
      isVisible: true,
    };

    const originalSelector = 'form > div > .btn.btn-primary';
    const fallbacks = generateFallbackSelectors(elementInfo);

    expect(fallbacks).not.toContainEqual({ strategy: 'css', value: originalSelector });
    expect(fallbacks[0]).toEqual({ strategy: 'css', value: '[data-testid="login-submit"]' });
  });
});
```

- [ ] **Step 2: 运行全部 agent 测试**

```bash
cd packages/agent && pnpm vitest run
```
Expected: All tests pass (selector-healer + replay-healing + fingerprint)

---

## 后续 Phase B（本计划不包含，供参考）

Phase A 验证自愈策略有效后，可抽象为：

1. `packages/mcp-healing-server/` — 独立 MCP Server
   - 工具：`run_test`, `get_failure_context`, `analyze_and_heal`, `apply_heal_fix`
   - 直接访问 fingerprint 数据和录制文件
   - 可被 Codex、Claude Code、OpenCode 等任何 agent 消费

2. `.agents/skills/test-self-healing/` — Skill 定义
   - 指导 agent 何时触发自愈、如何调用 MCP 工具、验证修复

3. 集成到 CI 流程：测试失败 → agent 收到通知 → 调用 MCP 自愈 → 提交修复

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 备选选择器定位到错误元素 | `waitFor({ state: 'attached' })` 验证存在性，role/text 策略 Playwright 本身有模糊匹配保护 |
| 自愈后操作行为异常 | 只尝试一次，失败后抛原始错误 |
| 某些 action 没有 elementInfo | 跳过自愈，直接抛出错误 |
| assert 类 action 被误自愈 | 白名单只包含交互型 action |
