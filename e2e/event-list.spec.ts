import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('event list shows real event data, dated links and keyboard focus at mobile width', async ({
  page,
  request,
}) => {
  const title = `Встреча ${randomUUID()}`;
  const created = await request.post('/api/events', {
    data: {
      title,
      startsAt: '2030-05-10T12:00:00Z',
      timezone: 'Asia/Bishkek',
      capacity: 12,
    },
  });
  expect(created.status()).toBe(201);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const link = page.getByRole('link', { name: new RegExp(title) });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('aria-label', /10 мая 2030.*18:00.*UTC\+6/);
  await expect(link).toContainText('18:00');
  expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(
    390,
  );

  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Создать событие' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link').nth(1)).toBeFocused();
});

test('event list has shaped loading, empty action and retry after an API error', async ({
  page,
}) => {
  await page.route('**/api/events', (route) => {
    void route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Пока нет предстоящих событий' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Создать событие' })).toHaveCount(2);

  await page.unroute('**/api/events');
  await page.route('**/api/events', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'unavailable', message: 'Временная ошибка' } }),
    });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('status', { name: 'Загрузка событий' })).toBeVisible();
  await expect(page.locator('.event-skeleton')).toHaveCount(3);
  await expect(page.getByRole('alert')).toContainText('Временная ошибка');
  await page.unroute('**/api/events');
  await page.getByRole('button', { name: 'Повторить загрузку' }).click();
  await expect(page.getByRole('heading', { name: 'События не загрузились' })).toHaveCount(0);
});
