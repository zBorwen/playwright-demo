import { pgTable, uuid, text, timestamp, varchar, integer } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const recordings = pgTable('recordings', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id),
  title: text('title').notNull(),
  targetUrl: text('target_url'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const recordingArtifacts = pgTable('recording_artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  recordingId: uuid('recording_id').notNull().references(() => recordings.id),
  type: varchar('type', { enum: ['actions', 'har'] }).notNull(),
  content: text('content'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const executions = pgTable('executions', {
  id: uuid('id').primaryKey().defaultRandom(),
  recordingId: uuid('recording_id').notNull().references(() => recordings.id),
  status: varchar('status', { enum: ['running', 'passed', 'failed'] }).notNull(),
  startedAt: timestamp('started_at').defaultNow(),
  finishedAt: timestamp('finished_at'),
  error: text('error'),
  trace: text('trace'),
});

export const executionArtifacts = pgTable('execution_artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  executionId: uuid('execution_id').notNull().references(() => executions.id),
  type: varchar('type', { enum: ['screenshot', 'har'] }).notNull(),
  path: text('path').notNull(),
  stepIndex: integer('step_index'),
});
