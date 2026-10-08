import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { FakeClock } from '../../src/clock.js';
import { formatInZone } from '../../src/format.js';
import { testConfig, testPool } from '../helpers/db.js';

const initialNow = new Date('2026-06-01T00:00:00.000Z');
const clock = new FakeClock(initialNow);
let app: FastifyInstance;

beforeEach(() => {
  clock.set(initialNow);
  app = buildApp({ db: testPool, clock, config: testConfig });
});
afterEach(async () => app.close());

async function createEvent(): Promise<{ id: string; key: string; startsAt: Date }> {
  const startsAt = new Date('2026-06-10T12:00:00.000Z');
  const response = await app.inject({
    method: 'POST',
    url: '/api/events',
    payload: {
      title: 'Перенос',
      startsAt: startsAt.toISOString(),
      timezone: 'Europe/Moscow',
      capacity: 2,
    },
  });
  expect(response.statusCode).toBe(201);
  return {
    id: response.json().event.id as string,
    key: response.json().organizerKey as string,
    startsAt,
  };
}

async function register(id: string, email: string): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/events/${id}/registrations`,
    payload: { email },
  });
  expect(response.statusCode).toBe(201);
}

describe('P6: rescheduling', () => {
  it('queues one localized email for confirmed and waitlisted registrations per schedule version', async () => {
    const event = await createEvent();
    for (const email of ['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com'])
      await register(event.id, email);
    const { rows: d } = await testPool.query<{ manage_token: string }>(
      "SELECT manage_token FROM registrations WHERE event_id = $1 AND email = 'd@example.com'",
      [event.id],
    );
    await app.inject({ method: 'DELETE', url: `/api/tickets/${d[0]!.manage_token}` });
    const url = `/api/organizer/events/${event.id}`;
    const newStart = new Date(event.startsAt.getTime() + 2 * 86400000);
    const move = () =>
      app.inject({
        method: 'PATCH',
        url,
        headers: { authorization: `Bearer ${event.key}` },
        payload: { startsAt: newStart.toISOString() },
      });
    expect((await move()).statusCode).toBe(200);
    const { rows } = await testPool.query<{
      to_email: string;
      body_text: string;
      dedup_key: string;
    }>(
      "SELECT to_email, body_text, dedup_key FROM outbox_emails WHERE kind = 'rescheduled' ORDER BY to_email",
    );
    expect(rows.map((row) => row.to_email)).toEqual([
      'a@example.com',
      'b@example.com',
      'c@example.com',
    ]);
    expect(rows[0]?.body_text).toContain(formatInZone(event.startsAt, 'Europe/Moscow'));
    expect(rows[0]?.body_text).toContain(formatInZone(newStart, 'Europe/Moscow'));
    expect(rows[0]?.body_text).not.toBe(rows[2]?.body_text);
    expect(rows.every((row) => row.dedup_key.endsWith(':2'))).toBe(true);
    expect((await move()).json()).toEqual({ unchanged: true });
    const { rows: unchangedEvent } = await testPool.query<{ schedule_version: number }>(
      'SELECT schedule_version FROM events WHERE id = $1',
      [event.id],
    );
    expect(unchangedEvent[0]?.schedule_version).toBe(2);
    expect(
      (await testPool.query("SELECT id FROM outbox_emails WHERE kind = 'rescheduled'")).rows,
    ).toHaveLength(3);
    const secondStart = new Date(newStart.getTime() + 86400000);
    const second = await app.inject({
      method: 'PATCH',
      url,
      headers: { authorization: `Bearer ${event.key}` },
      payload: { startsAt: secondStart.toISOString() },
    });
    expect(second.statusCode).toBe(200);
    expect(
      (await testPool.query("SELECT id FROM outbox_emails WHERE kind = 'rescheduled'")).rows,
    ).toHaveLength(6);
    const { rows: movedEvent } = await testPool.query<{ schedule_version: number }>(
      'SELECT schedule_version FROM events WHERE id = $1',
      [event.id],
    );
    expect(movedEvent[0]?.schedule_version).toBe(3);
  });

  it('rejects past dates and unauthorized updates, while metadata edits do not queue mail', async () => {
    const event = await createEvent();
    const anotherEvent = await createEvent();
    const url = `/api/organizer/events/${event.id}`;
    const payload = { startsAt: '2026-05-31T00:00:00.000Z' };
    const past = await app.inject({
      method: 'PATCH',
      url,
      headers: { authorization: `Bearer ${event.key}` },
      payload,
    });
    expect(past.statusCode).toBe(400);
    expect(past.json().error.message).toBe('Нельзя перенести на прошедшее время');
    for (const authorization of [undefined, 'Bearer wrong', `Bearer ${anotherEvent.key}`]) {
      const response = await app.inject({
        method: 'PATCH',
        url,
        ...(authorization ? { headers: { authorization } } : {}),
        payload: { title: 'Другое' },
      });
      expect(response.statusCode).toBe(401);
    }
    const metadata = await app.inject({
      method: 'PATCH',
      url,
      headers: { authorization: `Bearer ${event.key}` },
      payload: { title: 'Новое название', description: 'Новое описание' },
    });
    expect(metadata.statusCode).toBe(200);
    expect(
      (await testPool.query("SELECT id FROM outbox_emails WHERE kind = 'rescheduled'")).rows,
    ).toHaveLength(0);
  });
});
