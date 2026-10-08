import { expect, test, type Page } from '@playwright/test';

async function capture(page: Page, state: string) {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: `docs/screenshots/event-detail-${state}-${width}.png`,
      fullPage: true,
    });
    expect(await page.evaluate<number>('document.documentElement.scrollWidth')).toBeLessThanOrEqual(
      width,
    );
  }
}

test('detail shows registration, field error, retry, waitlist and page states', async ({
  page,
  request,
}) => {
  const created = await request.post('/api/events', {
    data: {
      title: 'День дизайна',
      description: 'Разговор о доступных интерфейсах.',
      startsAt: '2030-05-10T12:00:00Z',
      timezone: 'Asia/Bishkek',
      capacity: 1,
    },
  });
  expect(created.status()).toBe(201);
  const id: string = (await created.json()).event.id;
  await page.route(`**/api/events/${id}`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.continue();
  });
  await page.goto(`/e/${id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('status', { name: 'Загрузка события' })).toBeVisible();
  await capture(page, 'loading');
  await expect(page.getByRole('heading', { name: /День дизайна/ })).toBeVisible();
  await capture(page, 'ready');
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await expect(page.locator('#registration-email')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#registration-email-error')).toBeVisible();
  await capture(page, 'field-error');
  await page.getByLabel('Ваш email').fill('detail-one@example.com');
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await expect(page.getByRole('status')).toHaveText('Место ваше, билет на почте');
  await capture(page, 'success');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Встать в лист ожидания' })).toBeVisible();
  await capture(page, 'waitlist');
  await page.route(
    `**/api/events/${id}/registrations`,
    (route) =>
      void route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'unavailable', message: 'Временная ошибка' } }),
      }),
  );
  await page.getByLabel('Ваш email').fill('detail-two@example.com');
  await page.getByRole('button', { name: 'Встать в лист ожидания' }).click();
  await expect(page.getByRole('alert')).toContainText('Временная ошибка');
  await capture(page, 'general-error');
  await page.unroute(`**/api/events/${id}/registrations`);
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await page.getByRole('button', { name: 'Встать в лист ожидания' }).click();
  await expect(page.getByRole('status')).toHaveText('Вы в листе ожидания');
  await capture(page, 'waitlist-success');
  await page.goto('/e/not-an-event');
  await expect(page.getByRole('heading', { name: 'Событие не найдено' })).toBeVisible();
  await capture(page, 'not-found');
  await page.route(
    '**/api/events/not-an-event',
    (route) =>
      void route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'unavailable', message: 'Временная ошибка' } }),
      }),
  );
  await page.reload();
  await expect(page.getByRole('button', { name: 'Повторить загрузку' })).toBeVisible();
  await capture(page, 'load-error');
  await page.unroute('**/api/events/not-an-event');
  await page.getByRole('button', { name: 'Повторить загрузку' }).click();
  await expect(page.getByRole('heading', { name: 'Событие не найдено' })).toBeVisible();
});
