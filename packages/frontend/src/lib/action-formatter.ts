import type { ComponentType, SVGProps } from 'react';
import { MousePointer, Type, MoveRight, Hand, Keyboard, List, CheckSquare, Square, Eye, FileText, Upload } from 'lucide-react';
import type { RecordingAction } from '@playwright-demo/shared';

export const ACTION_ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  click: MousePointer,
  fill: Type,
  navigate: MoveRight,
  hover: Hand,
  press: Keyboard,
  select: List,
  check: CheckSquare,
  uncheck: Square,
  assertVisible: Eye,
  assertText: FileText,
  assertChecked: CheckSquare,
  assertValue: FileText,
  setInputFiles: Upload,
};

/** 截断过长的字符串 */
function truncate(s: string, len: number): string {
  return s.length > len ? s.slice(0, len) + '…' : s;
}

/** 从 Playwright internal selector 中提取人类可读名称 */
function extractInternalSelectorName(sel: string): string {
  // internal:role=button[name="登录"i] → 登录
  // internal:role=textbox[name="用户名"i] → 用户名
  const nameMatch = sel.match(/\[name=["']([^"']+)["']/i);
  if (nameMatch) return nameMatch[1];
  // internal:text="提交" → 提交
  const textMatch = sel.match(/:text=["']([^"']+)["']/i);
  if (textMatch) return textMatch[1];
  // internal:has-text="xxx" → xxx
  const hasTextMatch = sel.match(/:has-text=["']([^"']+)["']/i);
  if (hasTextMatch) return hasTextMatch[1];
  return '';
}

/** 提取元素的人类可读名称 */
function getElementLabel(action: RecordingAction): string {
  // 优先从 selector 中提取（Playwright internal selector 最可靠）
  if ('selector' in action && action.selector) {
    const sel = action.selector as string;
    const internalName = extractInternalSelectorName(sel);
    if (internalName) return internalName;
    // data-testid
    const testidMatch = sel.match(/\[data-testid=["']([^"']+)["']\]/)
      || sel.match(/\[data-test=["']([^"']+)["']\]/);
    if (testidMatch) return testidMatch[1];
  }

  // 再尝试 elementInfo
  const info = action.elementInfo;
  if (info) {
    const name = info.accessibleName || info.placeholder || info.labelText || info.name;
    if (name && name.trim()) return name.trim();
  }

  return '';
}

/** 判断是否是密码输入 */
const PASSWORD_KEYWORDS = ['password', 'passwd', 'pwd', '密码', '口令'];

function isPasswordField(action: RecordingAction): boolean {
  const info = action.elementInfo;
  if (info?.inputType?.toLowerCase() === 'password') return true;
  if ('selector' in action && action.selector) {
    const sel = (action.selector as string).toLowerCase();
    if (PASSWORD_KEYWORDS.some(kw => sel.includes(kw))) return true;
  }
  // 检查 label
  const label = getElementLabel(action).toLowerCase();
  if (PASSWORD_KEYWORDS.some(kw => label.includes(kw))) return true;
  return false;
}

/** 生成步骤的语义化描述 */
export function formatActionDetail(action: RecordingAction): string {
  const label = getElementLabel(action);

  switch (action.name) {
    case 'click':
      return label ? `点击「${label}」` : '点击';
    case 'fill':
      if (isPasswordField(action)) {
        return label ? `在「${label}」输入密码` : '输入密码';
      }
      return label
        ? `在「${label}」输入「${truncate(action.value || '', 20)}」`
        : `输入「${truncate(action.value || '', 20)}」`;
    case 'navigate':
      return `打开 ${truncate(action.url || '', 40)}`;
    case 'hover':
      return label ? `悬停「${label}」` : '悬停';
    case 'press':
      return `按键 ${action.key || ''}`;
    case 'select':
      return label
        ? `在「${label}」选择「${action.options?.join(', ') || ''}」`
        : `选择「${action.options?.join(', ') || ''}」`;
    case 'check':
      return label ? `勾选「${label}」` : '勾选';
    case 'uncheck':
      return label ? `取消勾选「${label}」` : '取消勾选';
    case 'setInputFiles':
      return label
        ? `在「${label}」上传文件`
        : `上传文件 (${action.files?.length || 0} 个)`;
    case 'assertVisible':
      return label ? `断言「${label}」可见` : '断言可见';
    case 'assertText':
      return `断言文本「${truncate(action.text || '', 20)}」`;
    case 'assertChecked':
      return label
        ? `断言「${label}」${action.checked ? '已勾选' : '未勾选'}`
        : `断言${action.checked ? '已勾选' : '未勾选'}`;
    case 'assertValue':
      return label
        ? `断言「${label}」值为「${truncate(action.value || '', 20)}」`
        : `断言值为「${truncate(action.value || '', 20)}」`;
    default:
      return (action as { name: string }).name;
  }
}
