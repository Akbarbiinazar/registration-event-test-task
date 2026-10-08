import { expect, test } from '@playwright/test';

test('home page shows API and DB status from /api/health', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Регистрация на мероприятия' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('API: ok, DB: ok');
});
