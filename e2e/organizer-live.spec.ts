import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { buildApp } from '../apps/api/src/app.js';
import { SystemClock } from '../apps/api/src/clock.js';
import { loadConfig } from '../apps/api/src/config.js';
import { createPool } from '../apps/api/src/db.js';

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

test('organizer dashboard reconnects after the API restarts', async ({ page, request }) => {
  const config = { ...loadConfig(), NODE_ENV: 'test' as const };
  const db = createPool(config.TEST_DATABASE_URL);
  let api = buildApp({ db, clock: new SystemClock(), config });
  try {
    await api.listen({ host: '127.0.0.1', port: 0 });
    const port = (api.server.address() as { port: number }).port;
    const base = `http://127.0.0.1:${port}`;
    await page.route('**/api/organizer/**', (route) => {
      const target = new URL(route.request().url());
      return route.continue({ url: `${base}${target.pathname}${target.search}` });
    });
    const created = await request.post(`${base}/api/events`, {
      data: {
        title: 'API restart',
        startsAt: '2030-05-10T15:00:00Z',
        timezone: 'UTC',
        capacity: 1,
      },
    });
    const { event, organizerKey } = (await created.json()) as {
      event: { id: string };
      organizerKey: string;
    };
    await page.goto(`/o/${event.id}#key=${organizerKey}`);
    await expect(page.getByRole('status')).toContainText('live');
    api.server.closeAllConnections();
    await api.close();
    await expect(page.getByRole('status')).toContainText('Переподключение');
    api = buildApp({ db, clock: new SystemClock(), config });
    await api.listen({ host: '127.0.0.1', port });
    await expect(page.getByRole('status')).toContainText('live', { timeout: 10000 });
    await expect(page.getByRole('listitem').filter({ hasText: 'Мест осталось' })).toContainText(
      '1',
    );
  } finally {
    api.server.closeAllConnections();
    await api.close();
    await db.end();
  }
});
