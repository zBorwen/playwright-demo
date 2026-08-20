import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { IssueRepository } from '../services/issue-repository';
import { IssueService } from '../services/issue-service';
import { createIssuesRouter } from '../routes/issues';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function tempDatabase(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-management-'));
  tempDirs.push(directory);
  return path.join(directory, 'issues.sqlite');
}

describe('Issue management', () => {
  it('keeps omitted fields during partial updates and records status history', () => {
    const service = new IssueService(new IssueRepository(':memory:'));
    try {
      const created = service.create({
        title: 'Preserve fields',
        description: 'Keep this description',
        priority: 'high',
        labels: ['regression', 'api'],
        assignee: 'borwen',
      });

      const updated = service.update(created.id, { status: 'in-progress' });
      expect(updated).toMatchObject({
        title: 'Preserve fields',
        description: 'Keep this description',
        priority: 'high',
        labels: ['regression', 'api'],
        assignee: 'borwen',
        status: 'in-progress',
      });
      expect(service.activities(created.id).some((entry) => (
        entry.type === 'status-changed' &&
        entry.fromStatus === 'open' &&
        entry.toStatus === 'in-progress'
      ))).toBe(true);
    } finally {
      service.close();
    }
  });

  it('persists issues across SQLite repository reopen and filters the stored data', () => {
    const databasePath = tempDatabase();
    const first = new IssueService(new IssueRepository(databasePath));
    const created = first.create({
      title: 'Persist me',
      description: 'SQLite-backed issue',
      status: 'blocked',
      priority: 'urgent',
      labels: ['storage'],
      assignee: 'alice',
    });
    first.close();

    const reopened = new IssueService(new IssueRepository(databasePath));
    try {
      expect(reopened.get(created.id)).toMatchObject({ title: 'Persist me', status: 'blocked' });
      expect(reopened.list({ status: 'blocked', priority: 'urgent', search: 'sqlite' })).toHaveLength(1);
      expect(reopened.list({ status: 'done' })).toHaveLength(0);
    } finally {
      reopened.close();
    }
  });

  it('rejects descriptions longer than 300 characters at the API boundary', async () => {
    const service = new IssueService(new IssueRepository(':memory:'));
    try {
      const router = createIssuesRouter(service);
      const response = await router.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Too long', description: 'x'.repeat(301) }),
      });
      expect(response.status).toBe(400);
      expect(service.list({})).toHaveLength(0);
    } finally {
      service.close();
    }
  });
});
