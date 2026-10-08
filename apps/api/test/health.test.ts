import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { FakeClock } from '../src/clock.js';
import { createPool } from '../src/db.js';
import { testConfig, testPool } from './helpers/db.js';

describe('GET /api/health', () => {
  it('reports ok and db true when Postgres answers', async () => {
    const app = buildApp({ db: testPool, clock: new FakeClock(), config: testConfig });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, db: true });
    await app.close();
  });

  it('returns the common error shape with 503 when the database is down', async () => {
    const deadDb = createPool('postgres://events:events@127.0.0.1:1/events', {
      connectionTimeoutMillis: 500,
    });
    const app = buildApp({ db: deadDb, clock: new FakeClock(), config: testConfig });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      error: { code: 'db_unavailable', message: 'Database is unavailable' },
    });
    await app.close();
    await deadDb.end();
  });

  it('answers unknown routes with the common error shape', async () => {
    const app = buildApp({ db: testPool, clock: new FakeClock(), config: testConfig });
    const res = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } });
    await app.close();
  });
});
