import { useState, useCallback, useRef } from 'react';
import { saveRecordingActions, type RecordingAction } from '@/lib/api';

interface RecordingJsonEditorProps {
  recordingId: string;
  actions: RecordingAction[];
  onSave?: () => void;
}

const PASSWORD_KEYWORDS = ['password', 'passwd', 'pwd', '密码', '口令'];

/** 判断 action 是否是密码输入 */
function isPasswordAction(action: RecordingAction): boolean {
  if (action.name !== 'fill') return false;
  const selector = ('selector' in action ? (action as Record<string, unknown>).selector : '') as string;
  const selLower = selector.toLowerCase();
  const elementInfo = (action as Record<string, unknown>).elementInfo as Record<string, unknown> | undefined;
  const inputType = (elementInfo?.inputType as string || '').toLowerCase();
  return inputType === 'password' || PASSWORD_KEYWORDS.some(kw => selLower.includes(kw));
}

/** 脱敏 actions 中的密码值 */
function maskPasswordInActions(actions: RecordingAction[]): RecordingAction[] {
  return actions.map(action => {
    if (!isPasswordAction(action)) return action;
    return { ...action, value: '***' };
  });
}

export function RecordingJsonEditor({ recordingId, actions, onSave }: RecordingJsonEditorProps) {
  const [jsonText, setJsonText] = useState(() => JSON.stringify(maskPasswordInActions(actions), null, 2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const rawActionsRef = useRef(actions);

  const handleValidate = useCallback(() => {
    try {
      JSON.parse(jsonText);
      setError(null);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }, [jsonText]);

  const handleFormat = useCallback(() => {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonText(JSON.stringify(maskPasswordInActions(parsed), null, 2));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [jsonText]);

  const handleSave = async () => {
    if (!handleValidate()) return;
    setSaving(true);
    setSaved(false);
    try {
      const parsed = JSON.parse(jsonText) as RecordingAction[];
      // 保存时用原始数据，确保密码值不被脱敏版本覆盖
      const merged = parsed.map((editAction, i) => {
        const raw = rawActionsRef.current[i];
        if (isPasswordAction(editAction) && (editAction as Record<string, unknown>).value === '***' && raw && 'value' in raw) {
          return { ...editAction, value: (raw as Record<string, unknown>).value };
        }
        return editAction;
      });
      await saveRecordingActions(recordingId, merged as RecordingAction[]);
      setSaved(true);
      onSave?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={handleFormat}
          className="rounded bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700"
        >
          格式化
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !!error}
          className="rounded bg-blue-900 px-3 py-1.5 text-sm hover:bg-blue-800 disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存'}
        </button>
        {saved && <span className="text-sm text-green-400">已保存</span>}
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950 px-3 py-2 text-sm text-red-300">
          JSON 错误: {error}
        </div>
      )}

      <textarea
        className="h-96 w-full rounded border border-zinc-700 bg-zinc-900 p-3 font-mono text-sm text-zinc-100"
        value={jsonText}
        onChange={(e) => {
          setJsonText(e.target.value);
          setSaved(false);
          setError(null);
        }}
        spellCheck={false}
      />
    </div>
  );
}
