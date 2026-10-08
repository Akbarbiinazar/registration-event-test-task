import { afterEach, beforeEach, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { FakeClock } from '../../src/clock.js';
import { assertInvariants, testConfig, testPool } from '../helpers/db.js';

const clock = new FakeClock(new Date('2026-06-01T18:42:00Z'));
let app: FastifyInstance;

async function stream(url: string) {
  const response = await fetch(url);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('SSE response has no body');
  const decoder = new TextDecoder();
  let buffer = '';
  return {
    response,
    async next(): Promise<{ registered: number; waitlisted: number; checkedIn: number }> {
      const deadline = AbortSignal.timeout(2000);
      while (!deadline.aborted) {
        const boundary = buffer.indexOf('\n\n');
        if (boundary >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = frame.split('\n').find((line) => line.startsWith('data: '));
          if (data)
            return JSON.parse(data.slice(6)) as {
              registered: number;
              waitlisted: number;
              checkedIn: number;
            };
          continue;
        }
        const chunk = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) =>
            deadline.addEventListener('abort', () => reject(new Error('SSE timeout')), {
              once: true,
            }),
          ),
        ]);
        if (chunk.done) throw new Error('SSE closed');
        buffer += decoder.decode(chunk.value, { stream: true });
      }
      throw new Error('SSE timeout');
    },
    close: () => reader.cancel(),
  };
}

beforeEach(async () => {
  app = buildApp({ db: testPool, clock, config: testConfig });
  await app.listen({ host: '127.0.0.1', port: 0 });
});

afterEach(async () => {
  await app.close();
  await assertInvariants();
});

it('delivers committed changes to two streams, including a notification from another DB connection', async () => {
  const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const created = await fetch(`${base}/api/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: 'Live',
      startsAt: '2026-07-01T10:00:00Z',
      timezone: 'UTC',
      capacity: 1,
    }),
  });
  const { event, organizerKey } = (await created.json()) as {
    event: { id: string };
    organizerKey: string;
  };
  const registration = await fetch(`${base}/api/events/${event.id}/registrations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'live@example.com' }),
  });
  expect(registration.status).toBe(201);
  const code = (
    await testPool.query<{ ticket_code: string }>(
      'SELECT ticket_code FROM registrations WHERE event_id = $1',
      [event.id],
    )
  ).rows[0]!.ticket_code;
  expect((await fetch(`${base}/api/organizer/events/${event.id}/stream`)).status).toBe(401);
  const url = `${base}/api/organizer/events/${event.id}/stream?key=${encodeURIComponent(organizerKey)}`;
  const first = await stream(url);
  const second = await stream(url);
  try {
    expect(first.response.status).toBe(200);
    expect((await first.next()).checkedIn).toBe(0);
    expect((await second.next()).checkedIn).toBe(0);
    const checked = await fetch(`${base}/api/organizer/events/${event.id}/checkins`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${organizerKey}` },
      body: JSON.stringify({ code }),
    });
    expect(checked.status).toBe(200);
    expect((await first.next()).checkedIn).toBe(1);
    expect((await second.next()).checkedIn).toBe(1);
    const repeat = await fetch(`${base}/api/organizer/events/${event.id}/checkins`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${organizerKey}` },
      body: JSON.stringify({ code }),
    });
    expect(repeat.status).toBe(409);
    expect(
      ((await repeat.json()) as { error: { code: string; checkedInAt: string } }).error,
    ).toMatchObject({ code: 'already_checked_in', checkedInAt: clock.now().toISOString() });
    const other = await testPool.connect();
    try {
      await other.query('BEGIN');
      await other.query("SELECT pg_notify('event_stats', $1)", [event.id]);
      await other.query('COMMIT');
    } finally {
      other.release();
    }
    expect((await first.next()).checkedIn).toBe(1);
    expect((await second.next()).checkedIn).toBe(1);
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
});
