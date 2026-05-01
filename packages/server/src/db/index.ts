import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const client = postgres(process.env.DATABASE_URL || 'postgres://localhost:5432/playwright_demo');
export const db = drizzle(client, { schema });
export { client };
export * from './schema';
