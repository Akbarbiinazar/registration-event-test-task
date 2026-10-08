import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { FakeClock } from '../src/clock.js';
import { testConfig, testPool } from './helpers/db.js';

const clock = new FakeClock(new Date('2026-06-01T00:00:00.000Z'));
let app: FastifyInstance;

beforeEach(() => {
  clock.set(new Date('2026-06-01T00:00:00.000Z'));
  app = buildApp({ db: testPool, clock, config: testConfig });
});
afterEach(async () => {
  await app.close();
});

const valid = {
  title: 'Meetup',
  description: 'Hello',
  startsAt: '2026-12-01T15:00:00.000Z',
  timezone: 'Europe/Moscow',
  capacity: 5,
};

async function create(body: Record<string, unknown> = valid) {
  return app.inject({ method: 'POST', url: '/api/events', payload: body });
}

describe('POST /api/events', () => {
  it('creates an event and returns it with an organizer key', async () => {
    const res = await create();
    expect(res.statusCode).toBe(201);
    const { event, organizerKey } = res.json();
    expect(organizerKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(event).toMatchObject({
      title: 'Meetup',
      capacity: 5,
      seatsLeft: 5,
      timezone: 'Europe/Moscow',
      hasStarted: false,
      startsAtLabel: '1 декабря 2026 г. в 18:00 (Moscow, UTC+3)',
    });
    const read = await app.inject({ method: 'GET', url: `/api/events/${event.id}` });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual(event);
  });

  it('stores only the SHA-256 of the organizer key', async () => {
    const { event, organizerKey } = (await create()).json();
    const { rows } = await testPool.query<{ organizer_token_hash: string }>(
      'SELECT organizer_token_hash FROM events WHERE id = $1',
      [event.id],
    );
    expect(rows[0]?.organizer_token_hash).not.toBe(organizerKey);
    expect(rows[0]?.organizer_token_hash).toBe(
      createHash('sha256').update(organizerKey).digest('hex'),
    );
  });

  it.each([
    ['empty title', { title: '' }],
    ['capacity 0', { capacity: 0 }],
    ['capacity 10001', { capacity: 10001 }],
    ['past date', { startsAt: '2026-05-31T00:00:00.000Z' }],
    ['invalid timezone', { timezone: 'Mars/Olympus' }],
    ['invalid date', { startsAt: 'tomorrow' }],
  ])('rejects %s with 400 and the common error shape', async (_name, patch) => {
    const res = await create({ ...valid, ...patch });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation_error');
    expect(typeof res.json().error.message).toBe('string');
  });
});

describe('GET /api/events', () => {
  it('lists only upcoming events, soonest first', async () => {
    await create({ ...valid, title: 'Later', startsAt: '2026-12-02T00:00:00.000Z' });
    await create({ ...valid, title: 'Sooner', startsAt: '2026-08-01T00:00:00.000Z' });
    clock.set(new Date('2026-09-01T00:00:00.000Z'));
    const res = await app.inject({ method: 'GET', url: '/api/events' });
    expect(res.json().map((e: { title: string }) => e.title)).toEqual(['Later']);
    clock.set(new Date('2026-06-01T00:00:00.000Z'));
    const all = await app.inject({ method: 'GET', url: '/api/events' });
    expect(all.json().map((e: { title: string }) => e.title)).toEqual(['Sooner', 'Later']);
  });
});

describe('GET /api/events/:id', () => {
  it('flags an event that has started, but still serves it', async () => {
    const { event } = (await create()).json();
    clock.set(new Date('2026-12-01T16:00:00.000Z'));
    const res = await app.inject({ method: 'GET', url: `/api/events/${event.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().hasStarted).toBe(true);
  });

  it.each(['00000000-0000-4000-8000-000000000000', 'not-a-uuid'])('404 for %s', async (id) => {
    const res = await app.inject({ method: 'GET', url: `/api/events/${id}` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });
});

describe('GET /api/organizer/events/:id', () => {
  it('returns the event with zeroed stats for the right key', async () => {
    const { event, organizerKey } = (await create()).json();
    const res = await app.inject({
      method: 'GET',
      url: `/api/organizer/events/${event.id}`,
      headers: { authorization: `Bearer ${organizerKey}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      event,
      stats: { registered: 0, waitlisted: 0, checkedIn: 0, capacity: 5 },
    });
  });

  it('401 without a key, with a wrong key, and with another event’s key', async () => {
    const a = (await create()).json();
    const b = (await create()).json();
    const url = `/api/organizer/events/${a.event.id}`;
    const none = await app.inject({ method: 'GET', url });
    const wrong = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: 'Bearer nope' },
    });
    const other = await app.inject({
      method: 'GET',
      url,
      headers: { authorization: `Bearer ${b.organizerKey}` },
    });
    for (const res of [none, wrong, other]) {
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('unauthorized');
    }
  });

  it('401 (not 404) for an unknown event', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/organizer/events/00000000-0000-4000-8000-000000000000',
      headers: { authorization: 'Bearer whatever' },
    });
    expect(res.statusCode).toBe(401);
  });
});
