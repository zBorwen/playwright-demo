import { useState, useMemo } from 'react';
import { Code, Copy, Check } from 'lucide-react';
import { highlightTypeScript } from '@/lib/syntax-highlight';

interface CodegenTabProps {
  codegen: string;
}

const PASSWORD_KEYWORDS = ['password', 'passwd', 'pwd', '密码', '口令'];

/** 在展示时脱敏密码：检测密码行并替换值为 '***' */
function maskPasswordDisplay(codegen: string): string {
  return codegen.split('\n').map(line => {
    const lower = line.toLowerCase();
    // 判断是否是 fill 操作且目标为密码字段
    if (!lower.includes('.fill(')) return line;
    if (!PASSWORD_KEYWORDS.some(kw => lower.includes(kw))) return line;
    // 替换 fill 括号中的字符串值: .fill('xxx') → .fill('***')
    return line.replace(/(\.fill\s*\(\s*)['"][^'"]*['"](\s*\))/g, '$1\'***\'$2');
  }).join('\n');
}

export function CodegenTab({ codegen }: CodegenTabProps) {
  const [copied, setCopied] = useState(false);
  const displayCodegen = useMemo(() => maskPasswordDisplay(codegen), [codegen]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(displayCodegen);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (codegen.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
        <Code className="mb-3 h-10 w-10 text-zinc-700" />
        <p className="text-sm">暂无生成代码</p>
        <p className="mt-1 text-xs text-zinc-600">录制或回放后将自动生成 Playwright 代码</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-400">
            TypeScript
          </span>
          <span className="text-[10px] text-zinc-600">
            {codegen.split('\n').length} 行
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-green-400" />
              <span className="text-green-400">已复制</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              复制
            </>
          )}
        </button>
      </div>
      {/* Code */}
      <pre
        className="overflow-auto p-4 text-sm font-mono leading-relaxed text-zinc-300"
        dangerouslySetInnerHTML={{ __html: highlightTypeScript(displayCodegen) }}
      />
    </div>
  );
}
