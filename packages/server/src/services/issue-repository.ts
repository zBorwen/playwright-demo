import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type {
  CreateIssueInput,
  Issue,
  IssueActivity,
  IssueFilters,
  IssuePriority,
  IssueStatus,
  UpdateIssueInput,
} from '@playwright-demo/shared';

interface IssueRow {
  id: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  labels: string;
  assignee: string | null;
  created_at: string;
  updated_at: string;
}

interface ActivityRow {
  id: string;
  issue_id: string;
  type: IssueActivity['type'];
  from_status: IssueStatus | null;
  to_status: IssueStatus | null;
  message: string;
  created_at: string;
}

export class IssueRepository {
  private readonly db: DatabaseSync;

  constructor(databasePath = process.env.ISSUES_DB_PATH ?? path.resolve('data/issues.sqlite')) {
    if (databasePath !== ':memory:') fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS issues (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        priority TEXT NOT NULL,
        labels TEXT NOT NULL DEFAULT '[]',
        assignee TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS issue_activities (
        id TEXT PRIMARY KEY,
        issue_id TEXT NOT NULL,
        type TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(issue_id) REFERENCES issues(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS issue_activities_issue_id_idx
        ON issue_activities(issue_id, created_at DESC);
    `);
  }

  close(): void {
    this.db.close();
  }

  list(filters: IssueFilters = {}): Issue[] {
    const rows = this.db.prepare('SELECT * FROM issues ORDER BY updated_at DESC').all() as unknown as IssueRow[];
    const normalizedSearch = filters.search?.trim().toLowerCase();
    return rows.map(toIssue).filter((issue) => {
      if (filters.status && issue.status !== filters.status) return false;
      if (filters.priority && issue.priority !== filters.priority) return false;
      if (filters.assignee && issue.assignee !== filters.assignee) return false;
      if (filters.label && !issue.labels.includes(filters.label)) return false;
      if (normalizedSearch) {
        const haystack = `${issue.title}\n${issue.description}`.toLowerCase();
        if (!haystack.includes(normalizedSearch)) return false;
      }
      return true;
    });
  }

  get(id: string): Issue | null {
    const row = this.db.prepare('SELECT * FROM issues WHERE id = ?').get(id) as unknown as IssueRow | undefined;
    return row ? toIssue(row) : null;
  }

  create(input: Required<Pick<CreateIssueInput, 'title' | 'description' | 'status' | 'priority' | 'labels'>> & Pick<CreateIssueInput, 'assignee'>): Issue {
    const now = new Date().toISOString();
    const issue: Issue = {
      id: randomUUID(),
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      labels: input.labels,
      assignee: input.assignee ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.db.prepare(`
      INSERT INTO issues (id, title, description, status, priority, labels, assignee, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      issue.id,
      issue.title,
      issue.description,
      issue.status,
      issue.priority,
      JSON.stringify(issue.labels),
      issue.assignee,
      issue.createdAt,
      issue.updatedAt,
    );
    this.insertActivity(issue.id, 'created', null, issue.status, `Issue created with status ${issue.status}.`, now);
    return issue;
  }

  update(id: string, input: UpdateIssueInput): Issue | null {
    const current = this.get(id);
    if (!current) return null;
    const next: Issue = {
      ...current,
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.labels !== undefined ? { labels: input.labels } : {}),
      ...(input.assignee !== undefined ? { assignee: input.assignee } : {}),
      updatedAt: new Date().toISOString(),
    };
    this.db.prepare(`
      UPDATE issues
      SET title = ?, description = ?, status = ?, priority = ?, labels = ?, assignee = ?, updated_at = ?
      WHERE id = ?
    `).run(
      next.title,
      next.description,
      next.status,
      next.priority,
      JSON.stringify(next.labels),
      next.assignee,
      next.updatedAt,
      id,
    );
    if (next.status !== current.status) {
      this.insertActivity(id, 'status-changed', current.status, next.status, `Status changed from ${current.status} to ${next.status}.`, next.updatedAt);
    } else {
      this.insertActivity(id, 'updated', null, null, 'Issue details updated.', next.updatedAt);
    }
    return next;
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM issues WHERE id = ?').run(id);
    return Number(result.changes) > 0;
  }

  activities(issueId: string): IssueActivity[] {
    const rows = this.db.prepare(
      'SELECT * FROM issue_activities WHERE issue_id = ? ORDER BY created_at DESC',
    ).all(issueId) as unknown as ActivityRow[];
    return rows.map(toActivity);
  }

  private insertActivity(
    issueId: string,
    type: IssueActivity['type'],
    fromStatus: IssueStatus | null,
    toStatus: IssueStatus | null,
    message: string,
    createdAt: string,
  ): void {
    this.db.prepare(`
      INSERT INTO issue_activities (id, issue_id, type, from_status, to_status, message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), issueId, type, fromStatus, toStatus, message, createdAt);
  }
}

function toIssue(row: IssueRow): Issue {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    labels: JSON.parse(row.labels) as string[],
    assignee: row.assignee,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toActivity(row: ActivityRow): IssueActivity {
  return {
    id: row.id,
    issueId: row.issue_id,
    type: row.type,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    message: row.message,
    createdAt: row.created_at,
  };
}
