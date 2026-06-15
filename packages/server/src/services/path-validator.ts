import path from 'node:path';
import os from 'node:os';

const STORAGE_BASE = path.resolve(process.env.STORAGE_PATH || './storage');

/** Agent 传入的文件路径允许的前缀目录列表 */
const ALLOWED_PATH_PREFIXES = [
  os.tmpdir(),
  STORAGE_BASE,
];

/**
 * 校验 agent 传入的文件路径是否在允许的目录范围内。
 * 防止恶意 agent 通过路径遍历读取服务器任意文件。
 */
export function validateAgentFilePath(filePath: string): void {
  const resolved = path.resolve(filePath);
  const isAllowed = ALLOWED_PATH_PREFIXES.some(
    (prefix) => resolved.startsWith(prefix + path.sep) || resolved === prefix,
  );
  if (!isAllowed) {
    throw new Error(`拒绝访问路径: ${resolved}（不在允许范围内）`);
  }
}
