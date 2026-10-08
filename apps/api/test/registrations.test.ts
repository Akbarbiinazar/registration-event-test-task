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
