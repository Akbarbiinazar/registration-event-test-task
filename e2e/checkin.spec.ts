import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

interface MailpitList {
  messages: { ID: string; To: { Address: string }[] }[];
}

test('organizer checks in a ticket once from the entry screen', async ({ page, request }) => {
  const email = `checkin-${randomUUID()}@example.com`;
  const created = await request.post('/api/events', {
    data: {
      title: 'Check-in E2E',
      startsAt: '2030-05-10T15:00:00Z',
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

  const mail = async () => {
    const list = await request.get('http://127.0.0.1:8025/api/v1/messages');
    return ((await list.json()) as MailpitList).messages.find((message) =>
      message.To.some((recipient) => recipient.Address === email),
    );
  };
  await expect.poll(async () => mail()).toBeTruthy();
  const message = await request.get(`http://127.0.0.1:8025/api/v1/message/${(await mail())!.ID}`);
  const body = ((await message.json()) as { Text: string }).Text;
  const code = body.match(/Код билета: ([0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4})/)?.[1];
  expect(code).toBeDefined();

  await page.goto(`/o/${event.id}/checkin#key=${organizerKey}`);
  const input = page.getByRole('textbox', { name: 'Код билета' });
  await expect(input).toBeFocused();
  await input.fill(code!.toLowerCase());
  await input.press('Enter');
  await expect(page.getByRole('status')).toContainText('Пропущен ✓');
  await expect(input).toHaveValue('');
  await expect(page.getByRole('listitem').filter({ hasText: code! })).toHaveCount(1);

  await input.fill(code!);
  await input.press('Enter');
  await expect(page.getByRole('status')).toContainText('Уже прошёл в');
  await expect(input).toHaveValue('');
});
