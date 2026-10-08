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

async function event(capacity: number): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/events',
    payload: {
      title: 'Race',
      startsAt: '2026-12-01T15:00:00Z',
      timezone: 'Europe/Moscow',
      capacity,
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json().event.id as string;
}

async function register(eventId: string, email: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/events/${eventId}/registrations`,
    payload: { email },
  });
  expect(response.statusCode).toBe(201);
  return response.json().status as string;
}

async function cancel(token: string): Promise<void> {
  const response = await app.inject({ method: 'DELETE', url: `/api/tickets/${token}` });
  expect(response.statusCode).toBe(200);
}

function startTogether<T>(operations: Array<() => Promise<T>>): Promise<T[]> {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const running = operations.map(async (operation) => {
    await gate;
    return operation();
  });
  release?.();
  return Promise.all(running);
}

async function registrations(
  eventId: string,
): Promise<Array<{ id: string; email: string; status: string; manage_token: string }>> {
  const { rows } = await testPool.query<{
    id: string;
    email: string;
    status: string;
    manage_token: string;
  }>(
    'SELECT id, email, status, manage_token FROM registrations WHERE event_id = $1 ORDER BY queue_seq',
    [eventId],
  );
  return rows;
}

async function seats(eventId: string): Promise<number> {
  const { rows } = await testPool.query<{ seats_taken: number }>(
    'SELECT seats_taken FROM events WHERE id = $1',
    [eventId],
  );
  return rows[0]!.seats_taken;
}

it('P3: gives exactly one of 20 concurrent registrations the last seat in 10 rounds', async () => {
  for (let round = 0; round < 10; round += 1) {
    const eventId = await event(1);
    const statuses = await startTogether(
      Array.from(
        { length: 20 },
        (_, index) => () => register(eventId, `round-${round}-person-${index}@example.com`),
      ),
    );
    expect(statuses.filter((status) => status === 'confirmed')).toHaveLength(1);
    expect(statuses.filter((status) => status === 'waitlisted')).toHaveLength(19);
    expect(await seats(eventId)).toBe(1);
    const { rows } = await testPool.query<{ kind: string; count: string }>(
      `SELECT o.kind, count(*) FROM outbox_emails o
       JOIN registrations r ON r.id = o.registration_id
       WHERE r.event_id = $1 GROUP BY o.kind`,
      [eventId],
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        { kind: 'ticket', count: '1' },
        { kind: 'waitlisted', count: '19' },
      ]),
    );
  }
}, 90_000);

it('gives one remaining seat to exactly one of two concurrent registrations', async () => {
  const eventId = await event(2);
  expect(await register(eventId, 'first@example.com')).toBe('confirmed');
  const statuses = await startTogether([
    () => register(eventId, 'second@example.com'),
    () => register(eventId, 'third@example.com'),
  ]);
  expect(statuses.sort()).toEqual(['confirmed', 'waitlisted']);
  expect(await seats(eventId)).toBe(2);
});

it('promotes both waitlisted people exactly once after concurrent cancellations', async () => {
  const eventId = await event(2);
  for (const email of ['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com']) {
    await register(eventId, email);
  }
  const before = await registrations(eventId);
  await startTogether(before.slice(0, 2).map((row) => () => cancel(row.manage_token)));
  const after = await registrations(eventId);
  expect(after.map((row) => row.status)).toEqual([
    'cancelled',
    'cancelled',
    'confirmed',
    'confirmed',
  ]);
  expect(await seats(eventId)).toBe(2);
  for (const row of after.slice(2)) {
    const { rows } = await testPool.query<{ kind: string; dedup_key: string }>(
      'SELECT kind, dedup_key FROM outbox_emails WHERE registration_id = $1 ORDER BY id',
      [row.id],
    );
    expect(rows).toEqual([
      { kind: 'waitlisted', dedup_key: `waitlisted:${row.id}` },
      { kind: 'ticket', dedup_key: `ticket:${row.id}` },
    ]);
  }
});

it('never strands a new registration on the waitlist during a concurrent cancellation', async () => {
  for (let round = 0; round < 50; round += 1) {
    const eventId = await event(1);
    await register(eventId, 'a@example.com');
    const [first] = await registrations(eventId);
    await startTogether([
      async () => {
        await register(eventId, 'c@example.com');
      },
      () => cancel(first!.manage_token),
    ]);
    expect((await registrations(eventId)).map((row) => row.status)).toEqual([
      'cancelled',
      'confirmed',
    ]);
    expect(await seats(eventId)).toBe(1);
  }
}, 90_000);

it('keeps FIFO when cancellation races a new registration behind an existing waitlist', async () => {
  const eventId = await event(1);
  await register(eventId, 'a@example.com');
  await register(eventId, 'b@example.com');
  const [first] = await registrations(eventId);
  await startTogether([
    async () => {
      await register(eventId, 'c@example.com');
    },
    () => cancel(first!.manage_token),
  ]);
  expect((await registrations(eventId)).map((row) => row.status)).toEqual([
    'cancelled',
    'confirmed',
    'waitlisted',
  ]);
  expect(await seats(eventId)).toBe(1);
});

it('rejects a direct database update above capacity', async () => {
  const eventId = await event(1);
  await expect(
    testPool.query('UPDATE events SET seats_taken = capacity + 1 WHERE id = $1', [eventId]),
  ).rejects.toMatchObject({ code: '23514' });
  expect(await seats(eventId)).toBe(0);
});
