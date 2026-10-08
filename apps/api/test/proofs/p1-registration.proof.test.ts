import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { FakeClock } from '../../src/clock.js';
import { assertInvariants, testConfig, testPool } from '../helpers/db.js';

const clock = new FakeClock(new Date('2026-06-01T00:00:00.000Z'));
let app: FastifyInstance;

beforeEach(() => {
  app = buildApp({ db: testPool, clock, config: testConfig });
});
afterEach(async () => {
  await app.close();
});

describe('P1: ticket email and idempotent registration', () => {
  it('queues one ticket and uses one seat after repeated mixed-case submissions', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/events',
      payload: {
        title: 'Meetup',
        description: '',
        startsAt: '2026-12-01T15:00:00.000Z',
        timezone: 'Europe/Moscow',
        capacity: 5,
      },
    });
    const eventId: string = created.json().event.id;
    const url = `/api/events/${eventId}/registrations`;
    const first = await app.inject({ method: 'POST', url, payload: { email: 'Ann@Example.com' } });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toEqual({ status: 'confirmed', alreadyRegistered: false });

    const initial = await testPool.query<{ id: string; ticket_code: string }>(
      'SELECT id, ticket_code FROM registrations WHERE event_id = $1',
      [eventId],
    );
    expect(initial.rowCount).toBe(1);
    const registration = initial.rows[0]!;
    const email = await testPool.query<{ kind: string; to_email: string; body_text: string }>(
      'SELECT kind, to_email, body_text FROM outbox_emails WHERE registration_id = $1',
      [registration.id],
    );
    expect(email.rows).toHaveLength(1);
    expect(email.rows[0]).toMatchObject({ kind: 'ticket', to_email: 'ann@example.com' });
    expect(email.rows[0]!.body_text).toContain(
      `${registration.ticket_code.slice(0, 4)}-${registration.ticket_code.slice(4)}`,
    );

    const repeat = await app.inject({
      method: 'POST',
      url,
      payload: { email: '  ann@example.COM ' },
    });
    expect(repeat.statusCode).toBe(201);
    expect(repeat.json()).toEqual({ status: 'confirmed', alreadyRegistered: true });
    const parallel = await Promise.all(
      Array.from({ length: 10 }, () =>
        app.inject({ method: 'POST', url, payload: { email: 'ANN@example.com' } }),
      ),
    );
    for (const res of parallel) {
      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ status: 'confirmed', alreadyRegistered: true });
    }
    const rows = await testPool.query<{ id: string }>(
      'SELECT id FROM registrations WHERE event_id = $1',
      [eventId],
    );
    expect(rows.rows).toEqual([{ id: registration.id }]);
    const event = await testPool.query<{ seats_taken: number }>(
      'SELECT seats_taken FROM events WHERE id = $1',
      [eventId],
    );
    expect(event.rows[0]?.seats_taken).toBe(1);
    const letters = await testPool.query<{ count: string }>(
      'SELECT count(*) FROM outbox_emails WHERE registration_id = $1',
      [registration.id],
    );
    expect(Number(letters.rows[0]?.count)).toBe(1);
    await assertInvariants();
  });
});
