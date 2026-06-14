/** 轻量语法高亮工具 — 基于正则 tokenization，返回带 Tailwind 类名的 HTML */

// ── HTML 转义 ──────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function span(cls: string, content: string): string {
  return `<span class="${cls}">${content}</span>`;
}

// ── JSON 高亮 ─────────────────────────────────────────────

/** 将 JSON 字符串转为带语法高亮的 HTML */
export function highlightJSON(code: string): string {
  const escaped = escapeHtml(code);
  return escaped.replace(
    /("(?:[^"\\]|\\.)*")\s*:/g,                    // 键名: "key":
    (_, m) => `${span('text-sky-300', m)}:`
  ).replace(
    /:\s*("(?:[^"\\]|\\.)*")/g,                   // 字符串值: "value"
    (_, m) => `: ${span('text-amber-300', m)}`
  ).replace(
    /:\s*(true|false)/g,                            // 布尔值
    (_, m) => `: ${span('text-violet-400', m)}`
  ).replace(
    /:\s*(null)/g,                                  // null
    (_, m) => `: ${span('text-violet-400', m)}`
  ).replace(
    /:\s*(-?\d+\.?\d*(?:[eE][+-]?\d+)?)/g,         // 数字
    (_, m) => `: ${span('text-cyan-300', m)}`
  );
}

// ── TypeScript 高亮 ───────────────────────────────────────

const TS_KEYWORDS = new Set([
  'import', 'from', 'export', 'default', 'const', 'let', 'var',
  'function', 'async', 'await', 'return', 'if', 'else', 'for',
  'while', 'class', 'new', 'try', 'catch', 'throw', 'typeof',
  'instanceof', 'void', 'null', 'undefined', 'true', 'false',
]);

/** 将 TypeScript 代码转为带语法高亮的 HTML（单次扫描分词器） */
export function highlightTypeScript(code: string): string {
  const result: string[] = [];

  for (const rawLine of code.split('\n')) {
    let i = 0;
    const line = rawLine;
    const len = line.length;
    let out = '';

    // 跳过行首空白，检查是否整行注释
    const trimmed = line.trimStart();
    if (trimmed.startsWith('//')) {
      result.push(span('text-zinc-500 italic', escapeHtml(line)));
      continue;
    }

    while (i < len) {
      // 行内注释
      if (line[i] === '/' && line[i + 1] === '/') {
        out += span('text-zinc-500 italic', escapeHtml(line.slice(i)));
        break;
      }

      // 多行注释开始
      if (line[i] === '/' && line[i + 1] === '*') {
        const end = line.indexOf('*/', i + 2);
        const commentEnd = end >= 0 ? end + 2 : len;
        out += span('text-zinc-500 italic', escapeHtml(line.slice(i, commentEnd)));
        i = commentEnd;
        continue;
      }

      // 双引号字符串
      if (line[i] === '"') {
        let j = i + 1;
        while (j < len && line[j] !== '"' && line[j] !== '\n') {
          if (line[j] === '\\') j++;
          j++;
        }
        out += span('text-amber-300', escapeHtml(line.slice(i, j + 1)));
        i = j + 1;
        continue;
      }

      // 单引号字符串
      if (line[i] === "'") {
        let j = i + 1;
        while (j < len && line[j] !== "'" && line[j] !== '\n') {
          if (line[j] === '\\') j++;
          j++;
        }
        out += span('text-amber-300', escapeHtml(line.slice(i, j + 1)));
        i = j + 1;
        continue;
      }

      // 模板字符串 (简单处理)
      if (line[i] === '`') {
        let j = i + 1;
        while (j < len && line[j] !== '`' && line[j] !== '\n') {
          if (line[j] === '\\') j++;
          j++;
        }
        out += span('text-amber-300', escapeHtml(line.slice(i, j + 1)));
        i = j + 1;
        continue;
      }

      // 数字
      if (/[0-9]/.test(line[i]) && (i === 0 || !/[a-zA-Z_$]/.test(line[i - 1]))) {
        let j = i;
        while (j < len && /[0-9.eExXa-fA-F_+\-]/.test(line[j])) j++;
        out += span('text-cyan-300', escapeHtml(line.slice(i, j)));
        i = j;
        continue;
      }

      // 标识符 (关键字 / 函数名)
      if (/[a-zA-Z_$]/.test(line[i])) {
        let j = i;
        while (j < len && /[a-zA-Z0-9_$]/.test(line[j])) j++;
        const word = line.slice(i, j);
        if (TS_KEYWORDS.has(word)) {
          out += span('text-violet-400', escapeHtml(word));
        } else if (j < len && line[j] === '(') {
          out += span('text-sky-300', escapeHtml(word));
        } else {
          out += escapeHtml(word);
        }
        i = j;
        continue;
      }

      // 其他字符
      out += escapeHtml(line[i]);
      i++;
    }

    result.push(out);
  }

  return result.join('\n');
}
