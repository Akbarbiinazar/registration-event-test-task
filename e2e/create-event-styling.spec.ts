import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

test.use({ timezoneId: 'Asia/Bishkek' });

async function capture(page: Page, state: string) {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: `docs/screenshots/create-event-${state}-${width}.png`,
      fullPage: true,
    });
    expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(
      width,
    );
  }
}

test('create form shows errors, pending state and a saved event in the browser zone', async ({
  page,
  request,
}) => {
  await page.goto('/events/new');
  await expect(page.getByRole('link', { name: 'Отмена' })).toBeVisible();
  await expect(page.getByText('Часовой пояс события: Asia/Bishkek')).toBeVisible();
  await capture(page, 'ready');

  await page.getByLabel('Название').fill('Встреча дизайнеров');
  await page.getByLabel('Начало (в вашем часовом поясе)').fill('2030-05-10T18:00');
  await page.getByLabel('Количество мест').fill('0');
  await page.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Количество мест');
  await expect(page.locator('#create-capacity')).toHaveAttribute(
    'aria-describedby',
    'create-capacity-error',
  );
  await expect(page.locator('#create-capacity')).toHaveAttribute('aria-invalid', 'true');
  await capture(page, 'error');
  await page
    .getByRole('alert')
    .getByRole('link', { name: /Количество мест/ })
    .click();
  await expect(page.locator('#create-capacity')).toBeFocused();

  await page.getByLabel('Количество мест').fill('3');
  await page.route('**/api/events', (route) => {
    if (route.request().method() === 'POST') {
      void route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'unavailable', message: 'Временная ошибка' } }),
      });
    } else void route.continue();
  });
  await page.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Временная ошибка');
  await capture(page, 'general-error');
  await page.unroute('**/api/events');
  await page.getByLabel('Название').fill(`Встреча дизайнеров ${randomUUID()}`);
  await page.route('**/api/events', async (route) => {
    if (route.request().method() === 'POST')
      await new Promise((resolve) => setTimeout(resolve, 350));
    await route.continue();
  });
  await page.getByRole('button', { name: 'Создать', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Создаём…' })).toBeDisabled();
  await capture(page, 'pending');
  await expect(page.getByRole('status')).toContainText('Событие создано');
  await capture(page, 'success');

  const publicUrl = await page.locator('.created-link a').first().getAttribute('href');
  expect(publicUrl).toBeTruthy();
  const id = publicUrl!.split('/').at(-1);
  const response = await request.get(`/api/events/${id}`);
  expect(response.ok()).toBe(true);
  const saved: { timezone: string; startsAtLabel: string } = await response.json();
  expect(saved.timezone).toBe('Asia/Bishkek');
  expect(saved.startsAtLabel).toContain('18:00');
  await page.getByRole('link', { name: 'Открыть событие' }).click();
  await expect(page.getByText('18:00')).toBeVisible();
  await expect(page.getByText(/Бишкек, UTC\+6/)).toBeVisible();
});
