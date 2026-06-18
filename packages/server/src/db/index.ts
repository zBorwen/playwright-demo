import { drizzle } from 'drizzle-orm/sqlite-proxy';
import initSqlJs, { type Database as SqlJsDb } from 'sql.js';
import path from 'node:path';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as schema from './schema';

const DB_PATH = process.env.DATABASE_PATH || './storage/playwright-demo.db';

const storageDir = path.dirname(DB_PATH);
if (!existsSync(storageDir)) {
  mkdirSync(storageDir, { recursive: true });
}

const SQL = await initSqlJs();

const sqlite: SqlJsDb = existsSync(DB_PATH)
  ? new SQL.Database(readFileSync(DB_PATH))
  : new SQL.Database();

sqlite.run('PRAGMA foreign_keys = ON');

// sqlite-proxy 回调驱动：Drizzle 通过回调操作 sql.js
export const db = drizzle(
  async (sql: string, params: unknown[], method: string) => {
    // sql.js 无法处理参数化查询中的某些类型，先手动拼接
    let runSql = sql;
    if (params.length > 0) {
      // 将 ? 占位符替换为实际值
      let paramIdx = 0;
      runSql = sql.replace(/\?/g, () => {
        const val = params[paramIdx++];
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'number') return String(val);
        if (typeof val === 'boolean') return val ? '1' : '0';
        // 字符串：转义单引号
        return `'${String(val).replace(/'/g, "''")}'`;
      });
    }

    try {
      if (method === 'run') {
        sqlite.run(runSql);
        return { rows: [] };
      }
      if (method === 'all') {
        const stmt = sqlite.prepare(runSql);
        const rows: unknown[] = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject());
        }
        stmt.free();
        return { rows };
      }
      if (method === 'get') {
        const stmt = sqlite.prepare(runSql);
        let row: unknown = undefined;
        if (stmt.step()) {
          row = stmt.getAsObject();
        }
        stmt.free();
        return { rows: row ? [row] : [] };
      }
      // values
      const stmt = sqlite.prepare(runSql);
      const rows: unknown[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return { rows };
    } catch (err) {
      console.error(`[sqlite-proxy] query failed: ${runSql}`, err);
      throw err;
    }
  },
  { schema },
);

// 进程退出时持久化到磁盘
const persist = () => {
  const data = sqlite.export();
  writeFileSync(DB_PATH, Buffer.from(data.buffer));
};
process.on('exit', persist);
process.on('SIGINT', () => { persist(); process.exit(0); });
process.on('SIGTERM', () => { persist(); process.exit(0); });
