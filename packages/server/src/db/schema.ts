import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  description: text('description'),
  replaySpeed: text('replay_speed').default('normal'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const recordings = sqliteTable('recordings', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: text('project_id').notNull().references(() => projects.id),
  title: text('title').notNull(),
  targetUrl: text('target_url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const recordingArtifacts = sqliteTable('recording_artifacts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  recordingId: text('recording_id').notNull().references(() => recordings.id),
  type: text('type').notNull(),
  content: text('content'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const executions = sqliteTable('executions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  recordingId: text('recording_id').notNull().references(() => recordings.id),
  status: text('status').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  error: text('error'),
  trace: text('trace'),
});

export const executionArtifacts = sqliteTable('execution_artifacts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  executionId: text('execution_id').notNull().references(() => executions.id),
  type: text('type').notNull(),
  path: text('path').notNull(),
  stepIndex: integer('step_index'),
});
