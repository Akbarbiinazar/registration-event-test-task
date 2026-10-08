import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { FakeClock } from '../src/clock.js';
import { assertInvariants, testConfig, testPool } from './helpers/db.js';

const clock = new FakeClock(new Date('2026-06-01T18:42:00Z'));
let app: FastifyInstance;
let eventId: string;
let key: string;

beforeEach(async () => {
  clock.set(new Date('2026-06-01T18:42:00Z'));
  app = buildApp({ db: testPool, clock, config: testConfig });
  const created = await app.inject({
    method: 'POST',
    url: '/api/events',
    payload: { title: 'Entry', startsAt: '2026-07-01T10:00:00Z', timezone: 'UTC', capacity: 1 },
  });
  ({ id: eventId } = created.json().event);
  key = created.json().organizerKey;
});

afterEach(async () => {
  await assertInvariants();
  await app.close();
});

const register = (email: string) =>
  app.inject({
    method: 'POST',
    url: `/api/events/${eventId}/registrations`,
    payload: { email },
  });
const checkIn = (code: string, id = eventId, bearer = key) =>
  app.inject({
    method: 'POST',
    url: `/api/organizer/events/${id}/checkins`,
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
    payload: { code },
  });
const row = async (email: string) =>
  (
    await testPool.query<{
      ticket_code: string;
      manage_token: string;
      checked_in_at: Date | null;
    }>(
      'SELECT ticket_code, manage_token, checked_in_at FROM registrations WHERE event_id = $1 AND email = $2',
      [eventId, email],
    )
  ).rows[0]!;

describe('check-in', () => {
  it('accepts the displayed code once, reports the original time, and preserves it', async () => {
    await register('a@example.com');
    const code = (await row('a@example.com')).ticket_code;
    const displayed = `${code.slice(0, 4)}-${code.slice(4)}`;
    const first = await checkIn(displayed.toLowerCase());
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ checkedInAt: clock.now().toISOString() });
    clock.advance(60_000);
    const repeat = await checkIn(displayed);
    expect(repeat.statusCode).toBe(409);
    expect(repeat.json().error).toMatchObject({
      code: 'already_checked_in',
      checkedInAt: '2026-06-01T18:42:00.000Z',
    });
    expect((await row('a@example.com')).checked_in_at?.toISOString()).toBe(
      '2026-06-01T18:42:00.000Z',
    );
  });

  it('normalizes Crockford substitutions, spaces and hyphens', async () => {
    await register('a@example.com');
    const code = (await row('a@example.com')).ticket_code;
    await testPool.query('UPDATE registrations SET ticket_code = $2 WHERE event_id = $1', [
      eventId,
      `0${code.slice(1, 7)}1`,
    ]);
    const ambiguous = `o ${code.slice(1, 4)}-${code.slice(4, 7)}l`;
    expect((await checkIn(ambiguous)).statusCode).toBe(200);
  });

  it('allows exactly one of ten concurrent requests', async () => {
    await register('a@example.com');
    const code = (await row('a@example.com')).ticket_code;
    const results = await Promise.all(Array.from({ length: 10 }, () => checkIn(code)));
    expect(results.filter((result) => result.statusCode === 200)).toHaveLength(1);
    expect(results.filter((result) => result.statusCode === 409)).toHaveLength(9);
  });

  it('distinguishes inactive tickets from missing and foreign tickets', async () => {
    await register('a@example.com');
    await register('b@example.com');
    const waiting = await row('b@example.com');
    expect((await checkIn(waiting.ticket_code)).json().error.code).toBe('ticket_not_active');
    await app.inject({ method: 'DELETE', url: `/api/tickets/${waiting.manage_token}` });
    expect((await checkIn(waiting.ticket_code)).json().error.code).toBe('ticket_not_active');
    const other = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: { title: 'Other', startsAt: '2026-07-01T10:00:00Z', timezone: 'UTC', capacity: 1 },
    });
    expect(
      (
        await checkIn(
          (await row('a@example.com')).ticket_code,
          other.json().event.id,
          other.json().organizerKey,
        )
      ).statusCode,
    ).toBe(404);
    expect((await checkIn('ZZZZZZZZ')).statusCode).toBe(404);
  });

  it('requires an organizer key and keeps checked-in tickets confirmed in Postgres', async () => {
    await register('a@example.com');
    const code = (await row('a@example.com')).ticket_code;
    expect((await checkIn(code, eventId, '')).statusCode).toBe(401);
    expect((await checkIn(code)).statusCode).toBe(200);
    await expect(
      testPool.query(
        "UPDATE registrations SET status = 'cancelled', cancelled_at = $2 WHERE event_id = $1",
        [eventId, clock.now()],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
