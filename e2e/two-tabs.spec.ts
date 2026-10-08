import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

interface MailpitList {
  messages: { ID: string; To: { Address: string }[] }[];
}

test('organizer dashboard updates across separate clients after registration and check-in', async ({
  browser,
  request,
}) => {
  const firstEmail = `two-tabs-${randomUUID()}@example.com`;
  const secondEmail = `two-tabs-${randomUUID()}@example.com`;
  const created = await request.post('/api/events', {
    data: {
      title: 'Two clients E2E',
      startsAt: '2030-05-10T15:00:00Z',
      timezone: 'UTC',
      capacity: 1,
    },
  });
  expect(created.status()).toBe(201);
  const { event, organizerKey } = (await created.json()) as {
    event: { id: string };
    organizerKey: string;
  };
  const organizerContext = await browser.newContext();
  const participantContext = await browser.newContext();

  try {
    const organizer = await organizerContext.newPage();
    await organizer.goto(`/o/${event.id}#key=${organizerKey}`);
    await expect(organizer.getByRole('status')).toContainText('live');

    const participant = await participantContext.newPage();
    await participant.goto(`/e/${event.id}`);
    await participant.getByRole('textbox', { name: 'Ваш email' }).fill(firstEmail);
    await participant.getByRole('button', { name: 'Зарегистрироваться' }).click();
    await expect(participant.getByRole('status')).toContainText('Место ваше');

    await participant.getByRole('textbox', { name: 'Ваш email' }).fill(secondEmail);
    await participant.getByRole('button', { name: 'Зарегистрироваться' }).click();
    await expect(participant.getByRole('status')).toContainText('Вы в листе ожидания');
    await expect(
      organizer.getByRole('listitem').filter({ hasText: 'Зарегистрировано' }),
    ).toContainText('1');
    await expect(
      organizer.getByRole('listitem').filter({ hasText: 'В листе ожидания' }),
    ).toContainText('1');

    const findTicket = async () => {
      const list = await request.get('http://127.0.0.1:8025/api/v1/messages');
      return ((await list.json()) as MailpitList).messages.find((message) =>
        message.To.some((recipient) => recipient.Address === firstEmail),
      );
    };
    await expect.poll(findTicket).toBeTruthy();
    const ticket = await request.get(
      `http://127.0.0.1:8025/api/v1/message/${(await findTicket())!.ID}`,
    );
    const code = ((await ticket.json()) as { Text: string }).Text.match(
      /Код билета: ([0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4})/,
    )?.[1];
    expect(code).toBeDefined();

    await participant.goto(`/o/${event.id}/checkin#key=${organizerKey}`);
    await participant.getByRole('textbox', { name: 'Код билета' }).fill(code!);
    await participant.getByRole('textbox', { name: 'Код билета' }).press('Enter');
    await expect(participant.getByRole('status')).toContainText('Пропущен ✓');
    await expect(organizer.getByRole('listitem').filter({ hasText: 'Пришло' })).toContainText('1');
  } finally {
    await Promise.all([organizerContext.close(), participantContext.close()]);
  }
});
