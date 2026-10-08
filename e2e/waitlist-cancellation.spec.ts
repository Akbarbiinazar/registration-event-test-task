import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

interface MailpitList {
  messages: { ID: string; To: { Address: string }[] }[];
}

test('cancellation promotes the first person in the waitlist and emails both people', async ({
  page,
  request,
}) => {
  const a = `first-${randomUUID()}@example.com`;
  const b = `next-${randomUUID()}@example.com`;
  const created = await request.post('/api/events', {
    data: {
      title: 'Waitlist E2E',
      startsAt: '2030-05-10T15:00:00Z',
      timezone: 'Europe/Moscow',
      capacity: 1,
    },
  });
  expect(created.status()).toBe(201);
  const eventId: string = (await created.json()).event.id;
  const register = async (email: string) =>
    request.post(`/api/events/${eventId}/registrations`, { data: { email } });
  expect((await register(a)).status()).toBe(201);
  expect((await register(b)).status()).toBe(201);

  const messages = async (email: string) => {
    const response = await request.get('http://127.0.0.1:8025/api/v1/messages');
    const list = (await response.json()) as MailpitList;
    return list.messages.filter((message) =>
      message.To.some((recipient) => recipient.Address === email),
    );
  };
  const body = async (id: string): Promise<string> => {
    const response = await request.get(`http://127.0.0.1:8025/api/v1/message/${id}`);
    return ((await response.json()) as { Text: string }).Text;
  };
  await expect.poll(async () => (await messages(a)).length).toBe(1);
  await expect.poll(async () => (await messages(b)).length).toBe(1);
  const waitlistBody = await body((await messages(b))[0]!.ID);
  expect(waitlistBody).toContain('Ваша позиция: 1');
  const link = (await body((await messages(a))[0]!.ID)).match(
    /http:\/\/localhost:5174\/t\/[A-Za-z0-9_-]{43}/,
  )?.[0];
  expect(link).toBeDefined();
  await page.goto(link!);
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Отказаться' }).click();
  await expect(page.getByRole('status')).toHaveText('Участие отменено');
  await expect.poll(async () => (await messages(a)).length).toBe(2);
  await expect.poll(async () => (await messages(b)).length).toBe(2);
  expect(
    (await body((await messages(a))[0]!.ID)) + (await body((await messages(a))[1]!.ID)),
  ).toContain('Ваш отказ');
  const bodies = await Promise.all((await messages(b)).map((message) => body(message.ID)));
  const ticketLink = bodies.join('\n').match(/http:\/\/localhost:5174\/t\/[A-Za-z0-9_-]{43}/)?.[0];
  expect(ticketLink).toBeDefined();
  await page.goto(ticketLink!);
  await expect(page.getByText(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/)).toBeVisible();
});
