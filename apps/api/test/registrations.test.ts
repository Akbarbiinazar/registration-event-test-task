import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { FakeClock } from '../src/clock.js';
import { assertInvariants, testConfig, testPool } from './helpers/db.js';

const clock = new FakeClock(new Date('2026-06-01T00:00:00.000Z'));
let app: FastifyInstance;
let eventId: string;

beforeEach(async () => {
  clock.set(new Date('2026-06-01T00:00:00.000Z'));
  app = buildApp({ db: testPool, clock, config: testConfig });
  const response = await app.inject({
    method: 'POST',
    url: '/api/events',
    payload: {
      title: 'Conference',
      startsAt: '2026-07-01T10:00:00Z',
      timezone: 'Europe/Moscow',
      capacity: 1,
    },
  });
  eventId = response.json().event.id;
});
afterEach(async () => {
  await assertInvariants();
  await app.close();
});

const register = (email: string) =>
  app.inject({ method: 'POST', url: `/api/events/${eventId}/registrations`, payload: { email } });

describe('registration API and database constraints', () => {
  it('returns the ticket only through its private link', async () => {
    const response = await register('Ann@Example.com');
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ status: 'confirmed', alreadyRegistered: false });
    const { rows } = await testPool.query<{ manage_token: string }>(
      'SELECT manage_token FROM registrations WHERE event_id = $1',
      [eventId],
    );
    const ticket = await app.inject({
      method: 'GET',
      url: `/api/tickets/${rows[0]!.manage_token}`,
    });
    expect(ticket.statusCode).toBe(200);
    expect(ticket.json()).toMatchObject({
      status: 'confirmed',
      event: { id: eventId, title: 'Conference' },
    });
    expect(ticket.json().code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  });

  it('allows registration after start and sends waitlisted registrations no ticket code', async () => {
    await register('a@example.com');
    clock.set(new Date('2026-07-02T00:00:00Z'));
    const response = await register('b@example.com');
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ status: 'waitlisted', alreadyRegistered: false });
    const { rows } = await testPool.query<{ manage_token: string }>(
      "SELECT manage_token FROM registrations WHERE event_id = $1 AND email = 'b@example.com'",
      [eventId],
    );
    const ticket = await app.inject({
      method: 'GET',
      url: `/api/tickets/${rows[0]!.manage_token}`,
    });
    expect(ticket.json()).not.toHaveProperty('code');
  });

  it('validates email and missing events in the common error shape', async () => {
    const bad = await register('invalid');
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('validation_error');
    const missing = await app.inject({
      method: 'POST',
      url: '/api/events/not-an-id/registrations',
      payload: { email: 'a@example.com' },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('not_found');
  });

  it('enforces active-email uniqueness and normalized email in Postgres', async () => {
    await register('a@example.com');
    const row = (
      await testPool.query<{ ticket_code: string; manage_token: string }>(
        'SELECT ticket_code, manage_token FROM registrations WHERE event_id = $1',
        [eventId],
      )
    ).rows[0]!;
    const insert = (email: string) =>
      testPool.query(
        `INSERT INTO registrations (event_id, email, status, ticket_code, manage_token, created_at)
         VALUES ($1, $2, 'waitlisted', $3, $4, $5)`,
        [eventId, email, '12345678', 'other-token', clock.now()],
      );
    await expect(insert('a@example.com')).rejects.toMatchObject({ code: '23505' });
    await expect(insert('A@example.com')).rejects.toMatchObject({ code: '23514' });
    expect(row.ticket_code).toHaveLength(8);
  });
});

describe('cancellation and waitlist', () => {
  async function token(email: string): Promise<string> {
    const { rows } = await testPool.query<{ manage_token: string }>(
      'SELECT manage_token FROM registrations WHERE event_id = $1 AND email = $2 ORDER BY queue_seq DESC LIMIT 1',
      [eventId, email],
    );
    return rows[0]!.manage_token;
  }

  it('removes a waitlisted registration and keeps repeat cancellation idempotent', async () => {
    await register('a@example.com');
    await register('b@example.com');
    await register('c@example.com');
    const b = await token('b@example.com');
    const before = await app.inject({ method: 'GET', url: `/api/tickets/${b}` });
    expect(before.json()).toMatchObject({ status: 'waitlisted', position: 1 });
    expect((await app.inject({ method: 'DELETE', url: `/api/tickets/${b}` })).json()).toEqual({
      status: 'cancelled',
    });
    expect((await app.inject({ method: 'DELETE', url: `/api/tickets/${b}` })).json()).toEqual({
      status: 'cancelled',
    });
    const c = await app.inject({
      method: 'GET',
      url: `/api/tickets/${await token('c@example.com')}`,
    });
    expect(c.json()).toMatchObject({ status: 'waitlisted', position: 1 });
    const letters = await testPool.query<{ kind: string }>(
      'SELECT kind FROM outbox_emails WHERE registration_id = (SELECT id FROM registrations WHERE manage_token = $1) ORDER BY id',
      [b],
    );
    expect(letters.rows.map((row) => row.kind)).toEqual(['waitlisted', 'cancelled']);
    const seats = await testPool.query<{ seats_taken: number }>(
      'SELECT seats_taken FROM events WHERE id = $1',
      [eventId],
    );
    expect(seats.rows[0]?.seats_taken).toBe(1);
  });

  it('releases a seat when no one waits and permits a new registration for the same email', async () => {
    await register('a@example.com');
    const oldToken = await token('a@example.com');
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/tickets/${oldToken}` })).statusCode,
    ).toBe(200);
    const again = await register('a@example.com');
    expect(again.json()).toEqual({ status: 'confirmed', alreadyRegistered: false });
    const rows = await testPool.query<{ id: string; ticket_code: string }>(
      "SELECT id, ticket_code FROM registrations WHERE event_id = $1 AND email = 'a@example.com' ORDER BY queue_seq",
      [eventId],
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0]!.id).not.toBe(rows.rows[1]!.id);
    expect(rows.rows[0]!.ticket_code).not.toBe(rows.rows[1]!.ticket_code);
    const letters = await testPool.query<{ kind: string }>(
      'SELECT kind FROM outbox_emails WHERE registration_id IN ($1, $2) ORDER BY id',
      rows.rows.map((row) => row.id),
    );
    expect(letters.rows.map((row) => row.kind)).toEqual(['ticket', 'cancelled', 'ticket']);
  });

  it('allows cancellation after start and rejects cancellation after check-in', async () => {
    await register('a@example.com');
    await register('b@example.com');
    const a = await token('a@example.com');
    clock.set(new Date('2026-07-02T00:00:00Z'));
    expect((await app.inject({ method: 'DELETE', url: `/api/tickets/${a}` })).statusCode).toBe(200);
    const b = await app.inject({
      method: 'GET',
      url: `/api/tickets/${await token('b@example.com')}`,
    });
    expect(b.json().status).toBe('confirmed');
    await testPool.query('UPDATE registrations SET checked_in_at = $2 WHERE manage_token = $1', [
      await token('b@example.com'),
      clock.now(),
    ]);
    const rejected = await app.inject({
      method: 'DELETE',
      url: `/api/tickets/${await token('b@example.com')}`,
    });
    expect(rejected.statusCode).toBe(409);
    expect(rejected.json().error.code).toBe('already_checked_in');
  });
});
