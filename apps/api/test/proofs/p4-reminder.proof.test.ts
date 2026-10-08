import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { FakeClock } from '../../src/clock.js';
import { formatInZone } from '../../src/format.js';
import { runReminderTick } from '../../src/jobs/reminders.js';
import { testConfig, testPool } from '../helpers/db.js';

const initialNow = new Date('2026-06-01T00:00:00.000Z');
const clock = new FakeClock(initialNow);
let app: FastifyInstance;

beforeEach(() => {
  clock.set(initialNow);
  app = buildApp({ db: testPool, clock, config: testConfig });
});
afterEach(async () => app.close());

async function createEvent(startsAt: Date, capacity = 10): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/events',
    payload: {
      title: 'Напоминание',
      startsAt: startsAt.toISOString(),
      timezone: 'Europe/Moscow',
      capacity,
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json().event.id as string;
}

async function register(eventId: string, email: string): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/events/${eventId}/registrations`,
    payload: { email },
  });
  expect(response.statusCode).toBe(201);
}

async function reminderRows(): Promise<
  { email: string; body_text: string; schedule_version: number; dedup_key: string }[]
> {
  const { rows } = await testPool.query<{
    email: string;
    body_text: string;
    schedule_version: number;
    dedup_key: string;
  }>(
    `SELECT o.to_email AS email, o.body_text, o.schedule_version, o.dedup_key
     FROM outbox_emails o WHERE o.kind = 'reminder' ORDER BY o.to_email`,
  );
  return rows;
}

const deps = { db: testPool, clock };

describe('P4: one reminder in the 24-hour window', () => {
  it('queues one reminder per confirmed participant and none for waitlisted or cancelled registrations', async () => {
    const startsAt = new Date('2026-06-02T00:00:00.000Z');
    const eventId = await createEvent(startsAt, 2);
    await register(eventId, 'a@example.com');
    await register(eventId, 'b@example.com');
    await register(eventId, 'c@example.com');
    await register(eventId, 'd@example.com');
    const { rows: dRows } = await testPool.query<{ manage_token: string }>(
      `SELECT manage_token FROM registrations WHERE event_id = $1 AND email = 'd@example.com'`,
      [eventId],
    );
    await app.inject({ method: 'DELETE', url: `/api/tickets/${dRows[0]!.manage_token}` });

    clock.set(new Date(startsAt.getTime() - 25 * 60 * 60 * 1000));
    expect(await runReminderTick(deps)).toBe(0);
    expect(await reminderRows()).toHaveLength(0);

    clock.set(new Date(startsAt.getTime() - 23 * 60 * 60 * 1000));
    expect(await runReminderTick(deps)).toBe(2);
    const first = await reminderRows();
    expect(first.map((row) => row.email)).toEqual(['a@example.com', 'b@example.com']);
    expect(first[0]?.body_text).toContain(formatInZone(startsAt, 'Europe/Moscow'));
    expect(first.every((row) => row.schedule_version === 1)).toBe(true);

    expect(await runReminderTick(deps)).toBe(0);
    const concurrent = await Promise.all(Array.from({ length: 12 }, () => runReminderTick(deps)));
    expect(concurrent.reduce((total, count) => total + count, 0)).toBe(0);
    expect(await reminderRows()).toHaveLength(2);
    for (const row of first) expect(row.dedup_key).toMatch(/^reminder:.+:1$/);

    clock.set(new Date(startsAt.getTime() + 60_000));
    expect(await runReminderTick(deps)).toBe(0);
    expect(await reminderRows()).toHaveLength(2);
  });

  it('includes the 24-hour lower boundary and excludes the event start boundary', async () => {
    const lowerBoundaryEvent = await createEvent(
      new Date(clock.now().getTime() + 24 * 60 * 60 * 1000),
    );
    const justInsideEvent = await createEvent(
      new Date(clock.now().getTime() + 24 * 60 * 60 * 1000 - 1),
    );
    const startBoundaryEvent = await createEvent(new Date(clock.now().getTime() + 1));
    await register(lowerBoundaryEvent, 'lower@example.com');
    await register(justInsideEvent, 'inside@example.com');
    await register(startBoundaryEvent, 'started@example.com');
    await testPool.query('UPDATE events SET starts_at = $2 WHERE id = $1', [
      startBoundaryEvent,
      clock.now(),
    ]);

    expect(await runReminderTick(deps)).toBe(2);
    expect((await reminderRows()).map((row) => row.email)).toEqual([
      'inside@example.com',
      'lower@example.com',
    ]);
  });

  it('reminds a promoted and a late confirmed registration on the next tick', async () => {
    const eventId = await createEvent(new Date(clock.now().getTime() + 2 * 60 * 60 * 1000), 2);
    await register(eventId, 'first@example.com');
    await register(eventId, 'promoted@example.com');
    const { rows } = await testPool.query<{ manage_token: string }>(
      `SELECT manage_token FROM registrations WHERE event_id = $1 AND email = 'first@example.com'`,
      [eventId],
    );
    await app.inject({ method: 'DELETE', url: `/api/tickets/${rows[0]!.manage_token}` });
    await register(eventId, 'late@example.com');
    await register(eventId, 'waitlisted@example.com');

    expect(await runReminderTick(deps)).toBe(2);
    expect((await reminderRows()).map((row) => row.email)).toEqual([
      'late@example.com',
      'promoted@example.com',
    ]);
  });

  it('queues a new reminder for the rescheduled date and schedule version', async () => {
    const oldStart = new Date(clock.now().getTime() + 12 * 60 * 60 * 1000);
    const eventId = await createEvent(oldStart);
    await register(eventId, 'moved@example.com');
    const newStart = new Date(oldStart.getTime() + 24 * 60 * 60 * 1000);
    await testPool.query('UPDATE events SET starts_at = $2, schedule_version = 2 WHERE id = $1', [
      eventId,
      newStart,
    ]);

    expect(await runReminderTick(deps)).toBe(0);
    clock.set(new Date(newStart.getTime() - 23 * 60 * 60 * 1000));
    expect(await runReminderTick(deps)).toBe(1);
    const reminders = await reminderRows();
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.dedup_key).toMatch(/^reminder:.+:2$/);
    expect(reminders[0]?.schedule_version).toBe(2);
    expect(reminders[0]?.body_text).toContain(formatInZone(newStart, 'Europe/Moscow'));
  });
});
