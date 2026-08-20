import type { CreateIssueInput, Issue, IssueActivity, IssueFilters, UpdateIssueInput } from '@playwright-demo/shared';
import { IssueRepository } from './issue-repository';

export class IssueService {
  constructor(private readonly repository = new IssueRepository()) {}

  close(): void {
    this.repository.close();
  }

  list(filters: IssueFilters): Issue[] {
    return this.repository.list(filters);
  }

  get(id: string): Issue | null {
    return this.repository.get(id);
  }

  create(input: CreateIssueInput): Issue {
    return this.repository.create({
      title: input.title.trim(),
      description: input.description?.trim() ?? '',
      status: input.status ?? 'open',
      priority: input.priority ?? 'medium',
      labels: normalizeLabels(input.labels ?? []),
      assignee: normalizeAssignee(input.assignee),
    });
  }

  update(id: string, input: UpdateIssueInput): Issue | null {
    return this.repository.update(id, {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.labels !== undefined ? { labels: normalizeLabels(input.labels) } : {}),
      ...(input.assignee !== undefined ? { assignee: normalizeAssignee(input.assignee) } : {}),
    });
  }

  delete(id: string): boolean {
    return this.repository.delete(id);
  }

  activities(issueId: string): IssueActivity[] {
    return this.repository.activities(issueId);
  }
}

function normalizeLabels(labels: string[]): string[] {
  return [...new Set(labels.map((label) => label.trim()).filter(Boolean))].slice(0, 10);
}

function normalizeAssignee(assignee: string | null | undefined): string | null {
  const normalized = assignee?.trim();
  return normalized ? normalized : null;
}
