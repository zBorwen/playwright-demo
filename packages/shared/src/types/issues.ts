export const ISSUE_STATUSES = ['open', 'in-progress', 'blocked', 'done'] as const;
export const ISSUE_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];

export interface Issue {
  id: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  labels: string[];
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IssueActivity {
  id: string;
  issueId: string;
  type: 'created' | 'status-changed' | 'updated';
  fromStatus: IssueStatus | null;
  toStatus: IssueStatus | null;
  message: string;
  createdAt: string;
}

export interface CreateIssueInput {
  title: string;
  description?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  labels?: string[];
  assignee?: string | null;
}

export interface UpdateIssueInput {
  title?: string;
  description?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  labels?: string[];
  assignee?: string | null;
}

export interface IssueFilters {
  status?: IssueStatus;
  priority?: IssuePriority;
  assignee?: string;
  label?: string;
  search?: string;
}
