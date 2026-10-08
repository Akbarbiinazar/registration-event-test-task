import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test.use({ timezoneId: 'Asia/Bishkek' });

interface MailpitList {
  messages: { ID: string; To: { Address: string }[] }[];
}

test('organizer reschedules an event and the participant receives a localized email', async ({
  page,
  request,
}) => {
  const email = `reschedule-${randomUUID()}@example.com`;
  const oldStart = new Date('2030-05-10T15:00:00.000Z');
  const created = await request.post('/api/events', {
    data: {
      title: 'Перенос E2E',
      startsAt: oldStart.toISOString(),
      timezone: 'Europe/Moscow',
      capacity: 1,
    },
  });
  expect(created.status()).toBe(201);
  const { event, organizerKey } = (await created.json()) as {
    event: { id: string };
    organizerKey: string;
  };
  expect(
    (await request.post(`/api/events/${event.id}/registrations`, { data: { email } })).status(),
  ).toBe(201);

  await page.goto(`/o/${event.id}#key=${organizerKey}`);
  await expect(page.getByRole('heading', { name: 'Перенос E2E — организатор' })).toBeVisible();
  await page.getByLabel('Новые дата и время').fill('2030-05-12T18:00');
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Перенести' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Дата события обновлена' }),
  ).toBeVisible();
  await expect(page.locator('article > p').first()).toContainText('12 мая 2030');
  const publicEvent = await request.get(`/api/events/${event.id}`);
  expect((await publicEvent.json()).startsAt).toBe('2030-05-12T15:00:00.000Z');

  const messages = async () => {
    const response = await request.get('http://127.0.0.1:8025/api/v1/messages');
    const list = (await response.json()) as MailpitList;
    return list.messages.filter((message) =>
      message.To.some((recipient) => recipient.Address === email),
    );
  };
  await expect.poll(async () => (await messages()).length).toBe(2);
  const bodies = await Promise.all(
    (await messages()).map(async ({ ID }) => {
      const detail = await request.get(`http://127.0.0.1:8025/api/v1/message/${ID}`);
      return ((await detail.json()) as { Text: string }).Text;
    }),
  );
  const body = bodies.find((text) => text.includes('Было:')) ?? '';
  expect(body).toContain('10 мая 2030 г. в 18:00 (Москва, UTC+3)');
  expect(body).toContain('12 мая 2030 г. в 18:00 (Москва, UTC+3)');
});
