import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

interface MailpitList {
  messages: { ID: string; To: { Address: string }[] }[];
}

test('registration email opens a ticket and mixed-case retry sends no second email', async ({
  page,
  request,
}) => {
  const email = `ticket-${randomUUID()}@example.com`;
  const created = await request.post('/api/events', {
    data: {
      title: 'Ticket E2E',
      startsAt: '2030-05-10T15:00:00Z',
      timezone: 'Europe/Moscow',
      capacity: 2,
    },
  });
  expect(created.status()).toBe(201);
  const eventId: string = (await created.json()).event.id;
  await page.goto(`/e/${eventId}`);
  await page.getByLabel('Ваш email').fill(email.toUpperCase());
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await expect(page.getByRole('status')).toHaveText('Место ваше, билет на почте');

  const messages = async () => {
    const response = await request.get('http://127.0.0.1:8025/api/v1/messages');
    const list = (await response.json()) as MailpitList;
    return list.messages.filter((message) =>
      message.To.some((recipient) => recipient.Address === email),
    );
  };
  await expect.poll(async () => (await messages()).length).toBe(1);
  const [mail] = await messages();
  const detail = await request.get(`http://127.0.0.1:8025/api/v1/message/${mail!.ID}`);
  expect(detail.ok()).toBe(true);
  const body: { Text: string } = await detail.json();
  const link = body.Text.match(/http:\/\/localhost:5173\/t\/[A-Za-z0-9_-]{43}/)?.[0];
  expect(link).toBeDefined();
  await page.goto(link!);
  await expect(page.getByRole('heading', { name: /Билет на/ })).toBeVisible();
  await expect(page.getByText(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/)).toBeVisible();

  await page.goto(`/e/${eventId}`);
  await page.getByLabel('Ваш email').fill(`  ${email.toUpperCase()}  `);
  await page.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await expect(page.getByRole('status')).toHaveText('Вы уже зарегистрированы');
  expect((await messages()).length).toBe(1);
});
