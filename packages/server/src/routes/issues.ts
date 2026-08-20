import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '../middleware/zod-validator';
import { successResponse, errorResponse, API_CODES } from '../middleware/response';
import { IssueService } from '../services/issue-service';
import { ISSUE_PRIORITIES, ISSUE_STATUSES, type IssueFilters } from '@playwright-demo/shared';

const issuePayload = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().max(300).optional(),
  status: z.enum(ISSUE_STATUSES).optional(),
  priority: z.enum(ISSUE_PRIORITIES).optional(),
  labels: z.array(z.string().max(32)).max(10).optional(),
  assignee: z.string().max(80).nullable().optional(),
});

const issuePatch = issuePayload.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one field is required.',
});

export function createIssuesRouter(service = new IssueService()) {
  const router = new Hono();

  router.get('/', (c) => {
    const filters: IssueFilters = {};
    const status = c.req.query('status');
    const priority = c.req.query('priority');
    if (status && ISSUE_STATUSES.includes(status as (typeof ISSUE_STATUSES)[number])) {
      filters.status = status as IssueFilters['status'];
    }
    if (priority && ISSUE_PRIORITIES.includes(priority as (typeof ISSUE_PRIORITIES)[number])) {
      filters.priority = priority as IssueFilters['priority'];
    }
    const assignee = c.req.query('assignee');
    const label = c.req.query('label');
    const search = c.req.query('search');
    if (assignee) filters.assignee = assignee;
    if (label) filters.label = label;
    if (search) filters.search = search;
    return c.json(successResponse(service.list(filters)));
  });

  router.post('/', zValidator('json', issuePayload), (c) => {
    const issue = service.create(c.req.valid('json'));
    return c.json(successResponse(issue), 201);
  });

  router.get('/:id', (c) => {
    const issue = service.get(c.req.param('id'));
    if (!issue) return c.json(errorResponse(API_CODES.NOT_FOUND, 'Issue not found'), 404);
    return c.json(successResponse(issue));
  });

  router.patch('/:id', zValidator('json', issuePatch), (c) => {
    const issue = service.update(c.req.param('id'), c.req.valid('json'));
    if (!issue) return c.json(errorResponse(API_CODES.NOT_FOUND, 'Issue not found'), 404);
    return c.json(successResponse(issue));
  });

  router.delete('/:id', (c) => {
    if (!service.delete(c.req.param('id'))) {
      return c.json(errorResponse(API_CODES.NOT_FOUND, 'Issue not found'), 404);
    }
    return c.json(successResponse({ deleted: true }));
  });

  router.get('/:id/activity', (c) => {
    if (!service.get(c.req.param('id'))) {
      return c.json(errorResponse(API_CODES.NOT_FOUND, 'Issue not found'), 404);
    }
    return c.json(successResponse(service.activities(c.req.param('id'))));
  });

  return router;
}

export const issuesRouter = createIssuesRouter();
