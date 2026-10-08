import { afterEach, beforeEach, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { FakeClock } from '../../src/clock.js';
import { assertInvariants, testConfig, testPool } from '../helpers/db.js';

const clock = new FakeClock(new Date('2026-06-01T00:00:00Z'));
let app: FastifyInstance;

beforeEach(() => {
  app = buildApp({ db: testPool, clock, config: testConfig });
});
afterEach(async () => {
  await assertInvariants();
  await app.close();
});

it('P2: promotes the first waitlisted registration and queues its ticket', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/api/events',
    payload: {
      title: 'Meetup',
      startsAt: '2026-12-01T15:00:00Z',
      timezone: 'Europe/Moscow',
      capacity: 1,
    },
  });
  const eventId: string = created.json().event.id;
  for (const email of ['a@example.com', 'b@example.com', 'c@example.com']) {
    const response = await app.inject({
      method: 'POST',
      url: `/api/events/${eventId}/registrations`,
      payload: { email },
    });
    expect(response.statusCode).toBe(201);
  }
  const before = await testPool.query<{
    email: string;
    status: string;
    manage_token: string;
    id: string;
  }>(
    'SELECT email, status, manage_token, id FROM registrations WHERE event_id = $1 ORDER BY queue_seq',
    [eventId],
  );
  expect(before.rows.map((row) => row.status)).toEqual(['confirmed', 'waitlisted', 'waitlisted']);
  for (const row of before.rows.slice(1)) {
    const letters = await testPool.query<{ kind: string }>(
      'SELECT kind FROM outbox_emails WHERE registration_id = $1',
      [row.id],
    );
    expect(letters.rows.map((letter) => letter.kind)).toEqual(['waitlisted']);
  }
  const cancelled = await app.inject({
    method: 'DELETE',
    url: `/api/tickets/${before.rows[0]!.manage_token}`,
  });
  expect(cancelled.statusCode).toBe(200);
  const after = await testPool.query<{ status: string }>(
    'SELECT status FROM registrations WHERE event_id = $1 ORDER BY queue_seq',
    [eventId],
  );
  expect(after.rows.map((row) => row.status)).toEqual(['cancelled', 'confirmed', 'waitlisted']);
  const promotedLetters = await testPool.query<{ kind: string }>(
    'SELECT kind FROM outbox_emails WHERE registration_id = $1 ORDER BY id',
    [before.rows[1]!.id],
  );
  expect(promotedLetters.rows.map((letter) => letter.kind)).toEqual(['waitlisted', 'ticket']);
  const event = await testPool.query<{ seats_taken: number }>(
    'SELECT seats_taken FROM events WHERE id = $1',
    [eventId],
  );
  expect(event.rows[0]?.seats_taken).toBe(1);
});

it('promotes two waitlisted people exactly once when two confirmed people cancel concurrently', async () => {
  const created = await app.inject({
    method: 'POST',
    url: '/api/events',
    payload: {
      title: 'Meetup',
      startsAt: '2026-12-01T15:00:00Z',
      timezone: 'Europe/Moscow',
      capacity: 2,
    },
  });
  const eventId: string = created.json().event.id;
  for (const email of ['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com']) {
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/events/${eventId}/registrations`,
          payload: { email },
        })
      ).statusCode,
    ).toBe(201);
  }
  const rows = await testPool.query<{ id: string; manage_token: string }>(
    'SELECT id, manage_token FROM registrations WHERE event_id = $1 ORDER BY queue_seq',
    [eventId],
  );
  const responses = await Promise.all(
    rows.rows
      .slice(0, 2)
      .map((row) => app.inject({ method: 'DELETE', url: `/api/tickets/${row.manage_token}` })),
  );
  expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
  const after = await testPool.query<{ status: string }>(
    'SELECT status FROM registrations WHERE event_id = $1 ORDER BY queue_seq',
    [eventId],
  );
  expect(after.rows.map((row) => row.status)).toEqual([
    'cancelled',
    'cancelled',
    'confirmed',
    'confirmed',
  ]);
  for (const row of rows.rows.slice(2)) {
    const letters = await testPool.query<{ kind: string }>(
      'SELECT kind FROM outbox_emails WHERE registration_id = $1 ORDER BY id',
      [row.id],
    );
    expect(letters.rows.map((letter) => letter.kind)).toEqual(['waitlisted', 'ticket']);
  }
  const event = await testPool.query<{ seats_taken: number }>(
    'SELECT seats_taken FROM events WHERE id = $1',
    [eventId],
  );
  expect(event.rows[0]?.seats_taken).toBe(2);
});
