import { expect, test } from '@playwright/test';

test('API health answers through the web proxy', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
  expect(await res.json()).toEqual({ ok: true, db: true });
});

test('home page lists upcoming events and links to creation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Предстоящие события' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Создать событие' })).toBeVisible();
});
