import { useState, useCallback, useRef, useEffect } from 'react';
import { saveRecordingActions, type RecordingAction } from '@/lib/api';
import { highlightJSON } from '@/lib/syntax-highlight';
import { isPasswordField } from '@/lib/action-formatter';

interface RecordingJsonEditorProps {
  recordingId: string;
  actions: RecordingAction[];
  onSave?: () => void;
}

/** 脱敏 actions 中的密码值 */
function maskPasswordInActions(actions: RecordingAction[]): RecordingAction[] {
  return actions.map(action => {
    if (action.name !== 'fill' || !isPasswordField(action)) return action;
    return { ...action, value: '***' };
  });
}

export function RecordingJsonEditor({ recordingId, actions, onSave }: RecordingJsonEditorProps) {
  const [jsonText, setJsonText] = useState(() => JSON.stringify(maskPasswordInActions(actions), null, 2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const rawActionsRef = useRef(actions);

  useEffect(() => {
    rawActionsRef.current = actions;
    setJsonText(JSON.stringify(maskPasswordInActions(actions), null, 2));
    setSaved(false);
  }, [actions]);

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
      setIsEditing(false);
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
        if (isPasswordField(editAction) && (editAction as Record<string, unknown>).value === '***' && raw && 'value' in raw) {
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
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            编辑
          </button>
        ) : (
          <>
            <button
              onClick={handleFormat}
              className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            >
              格式化
            </button>
            <button
              onClick={() => setIsEditing(false)}
              className="inline-flex items-center gap-2 rounded-md border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            >
              取消编辑
            </button>
          </>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !!error}
          className="inline-flex items-center gap-2 rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? '保存中...' : '保存'}
        </button>
        {saved && <span className="text-sm text-green-400">已保存</span>}
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
          JSON 错误: {error}
        </div>
      )}

      {/* Content */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 overflow-hidden">
        {isEditing ? (
          <textarea
            className="h-96 w-full bg-transparent p-4 font-mono text-sm text-zinc-100 outline-none"
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setSaved(false);
              setError(null);
            }}
            spellCheck={false}
          />
        ) : (
          <pre
            className="overflow-auto p-4 text-sm font-mono text-zinc-300"
            dangerouslySetInnerHTML={{ __html: highlightJSON(jsonText) }}
          />
        )}
      </div>
    </div>
  );
}
