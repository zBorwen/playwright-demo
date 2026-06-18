import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import path from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';
import * as schema from './schema';

const dbPath = process.env.DATABASE_PATH || './storage/playwright-demo.db';

const storageDir = path.dirname(dbPath);
if (!existsSync(storageDir)) {
  mkdirSync(storageDir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
