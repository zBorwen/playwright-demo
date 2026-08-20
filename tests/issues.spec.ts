import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  const response = await request.get('http://127.0.0.1:3000/api/issues');
  const body = await response.json() as { success: boolean; data: Array<{ id: string }> };
  if (body.success) {
    await Promise.all(body.data.map((issue) => request.delete(`http://127.0.0.1:3000/api/issues/${issue.id}`)));
  }
});

test('issue workspace keeps long text contained and clears stale detail after filtering', async ({ page }) => {
  await page.goto('/issues');
  await page.getByRole('button', { name: 'New issue' }).click();

  const createForm = page.locator('form');
  await createForm.getByLabel(/^Title/).fill('Browser regression issue');
  const longDescription = 'x'.repeat(350);
  await createForm.getByLabel(/^Description/).fill(longDescription);
  await expect(createForm.getByLabel(/^Description/)).toHaveValue('x'.repeat(300));
  await createForm.getByLabel(/^Priority/).selectOption('urgent');
  await createForm.getByLabel(/^Assignee/).fill('alice');
  await createForm.getByLabel(/^Labels/).fill('ui, regression');
  await createForm.getByRole('button', { name: 'Create issue' }).click();

  const issueRow = page.getByRole('button', { name: /Browser regression issue/ });
  await expect(issueRow).toBeVisible();
  await issueRow.click();
  await expect(page.getByRole('heading', { name: 'Browser regression issue' })).toBeVisible();

  const description = page.locator('aside p').filter({ hasText: 'x'.repeat(50) }).first();
  await expect(description).toBeVisible();
  const contained = await description.evaluate((element) => element.scrollWidth <= element.clientWidth + 1);
  expect(contained).toBe(true);

  await page.getByLabel('Filter by status').selectOption('done');
  await expect(issueRow).toHaveCount(0);
  await expect(page.getByText('Select an issue to inspect details and activity.')).toBeVisible();
});
