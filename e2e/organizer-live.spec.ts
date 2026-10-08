import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

interface MailpitList {
  messages: { ID: string; To: { Address: string }[] }[];
}

test('two organizer tabs update after registration and check-in in a third tab', async ({
  context,
  request,
}) => {
  const email = `live-${randomUUID()}@example.com`;
  const created = await request.post('/api/events', {
    data: { title: 'Live E2E', startsAt: '2030-05-10T15:00:00Z', timezone: 'UTC', capacity: 2 },
  });
  const { event, organizerKey } = (await created.json()) as {
    event: { id: string };
    organizerKey: string;
  };
  const url = `/o/${event.id}#key=${organizerKey}`;
  const first = await context.newPage();
  const second = await context.newPage();
  await Promise.all([first.goto(url), second.goto(url)]);
  await expect(first.getByRole('status')).toContainText('live');
  await expect(second.getByRole('status')).toContainText('live');
  const participant = await context.newPage();
  await participant.goto(`/e/${event.id}`);
  await participant.getByRole('textbox', { name: 'Ваш email' }).fill(email);
  await participant.getByRole('button', { name: 'Зарегистрироваться' }).click();
  await expect(participant.getByRole('status')).toContainText('Место ваше');
  await expect(first.getByRole('listitem').filter({ hasText: 'Зарегистрировано' })).toContainText(
    '1',
  );
  await expect(second.getByRole('listitem').filter({ hasText: 'Зарегистрировано' })).toContainText(
    '1',
  );

  const findMail = async () => {
    const list = await request.get('http://127.0.0.1:8025/api/v1/messages');
    return ((await list.json()) as MailpitList).messages.find((message) =>
      message.To.some((recipient) => recipient.Address === email),
    );
  };
  await expect.poll(findMail).toBeTruthy();
  const message = await request.get(
    `http://127.0.0.1:8025/api/v1/message/${(await findMail())!.ID}`,
  );
  const code = ((await message.json()) as { Text: string }).Text.match(
    /Код билета: ([0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4})/,
  )?.[1];
  expect(code).toBeDefined();
  const checkin = await context.newPage();
  await checkin.goto(`/o/${event.id}/checkin#key=${organizerKey}`);
  const input = checkin.getByRole('textbox', { name: 'Код билета' });
  await input.fill(code!);
  await input.press('Enter');
  await expect(checkin.getByRole('status')).toContainText('Пропущен ✓');
  await expect(first.getByRole('listitem').filter({ hasText: 'Пришло' })).toContainText('1');
  await expect(second.getByRole('listitem').filter({ hasText: 'Пришло' })).toContainText('1');
});

test('organizer stream reconnects after a lost connection', async ({ page, request }) => {
  const created = await request.post('/api/events', {
    data: {
      title: 'Reconnect E2E',
      startsAt: '2030-05-10T15:00:00Z',
      timezone: 'UTC',
      capacity: 1,
    },
  });
  const { event, organizerKey } = (await created.json()) as {
    event: { id: string };
    organizerKey: string;
  };
  let attempts = 0;
  await page.route('**/stream?key=*', async (route) => {
    attempts += 1;
    if (attempts === 1) await route.abort();
    else await route.continue();
  });
  await page.goto(`/o/${event.id}#key=${organizerKey}`);
  await expect(page.getByRole('status')).toContainText('Переподключение');
  await expect(page.getByRole('status')).toContainText('live', { timeout: 10000 });
  expect(attempts).toBeGreaterThanOrEqual(2);
});
