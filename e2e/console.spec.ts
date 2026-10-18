import { expect, test } from '@playwright/test';

test('create a template, screen a prompt, and register an application', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  await expect(page.getByText('Demo mode')).toBeVisible();

  // Create a strict template.
  await page.getByRole('link', { name: 'Model Armor templates' }).first().click();
  await page.getByRole('link', { name: 'New template' }).click();
  await page.getByLabel('ID', { exact: true }).fill('e2e-strict');
  await page.getByLabel('Dangerous content').selectOption('LOW_AND_ABOVE');
  await page.getByRole('button', { name: 'Create template' }).click();
  await expect(page.getByRole('heading', { name: 'e2e-strict', exact: true })).toBeVisible();

  // Screen a prompt injection attempt.
  await page.getByRole('link', { name: 'Test in playground' }).click();
  await page.getByRole('button', { name: 'Prompt injection' }).click();
  await page.getByRole('button', { name: 'Screen text' }).click();
  await expect(page.getByText('Violation found')).toBeVisible();

  // Register an application and read its instructions.
  await page.getByRole('link', { name: 'Applications' }).first().click();
  await page.getByRole('link', { name: 'Register application' }).click();
  await page.getByLabel('Name').fill('Support bot');
  await page.getByLabel('Where the policy is applied').selectOption('apigee');
  await page.getByLabel('Prompt template').selectOption('e2e-strict');
  await page.getByRole('button', { name: 'Register application' }).click();
  await expect(page.getByRole('heading', { name: 'Support bot', exact: true })).toBeVisible();
  await expect(page.getByText('Apply Model Armor in Apigee for Support bot')).toBeVisible();
  await expect(page.getByText('projects/demo-project/locations/us-central1/templates/e2e-strict').first()).toBeVisible();

  // The template it uses cannot be deleted without a warning.
  await page.getByRole('link', { name: 'e2e-strict' }).first().click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('This template is assigned to Support bot')).toBeVisible();
});

test('DLP inspect templates can be created with custom patterns', async ({ page }) => {
  await page.goto('/dlp');
  await page.getByRole('link', { name: 'New inspect template' }).click();
  await page.getByLabel('Template ID').fill('employee-ids');
  await page.getByLabel('Display name').fill('Employee IDs');
  await page.getByRole('button', { name: 'Add pattern' }).click();
  await page.getByPlaceholder('EMPLOYEE_ID').fill('EMPLOYEE_ID');
  await page.getByPlaceholder('E-\\d{6}').fill('E-\\d{6}');
  await page.getByRole('button', { name: 'Create template' }).click();
  await expect(page.getByRole('link', { name: 'Employee IDs' })).toBeVisible();
  await expect(page.getByText('EMPLOYEE_ID (custom)')).toBeVisible();
});

test('a template can be duplicated', async ({ page }) => {
  await page.goto('/templates/baseline-safety');
  await page.getByRole('link', { name: 'Duplicate' }).click();
  await expect(page.getByLabel('ID', { exact: true })).toHaveValue('baseline-safety-copy');
  await page.getByRole('button', { name: 'Create template' }).click();
  await expect(page.getByRole('heading', { name: 'baseline-safety-copy', exact: true })).toBeVisible();
});
