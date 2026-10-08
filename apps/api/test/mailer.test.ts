import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { FakeClock } from '../src/clock.js';
import { runMailerTick, type MailMessage } from '../src/jobs/mailer.js';
import { testConfig, testPool } from './helpers/db.js';

const clock = new FakeClock(new Date('2026-06-01T00:00:00Z'));
let app: FastifyInstance;

beforeEach(async () => {
  clock.set(new Date('2026-06-01T00:00:00Z'));
  app = buildApp({ db: testPool, clock, config: testConfig });
  const created = await app.inject({
    method: 'POST',
    url: '/api/events',
    payload: {
      title: 'Conference',
      startsAt: '2026-07-01T10:00:00Z',
      timezone: 'Europe/Moscow',
      capacity: 1,
    },
  });
  await app.inject({
    method: 'POST',
    url: `/api/events/${created.json().event.id}/registrations`,
    payload: { email: 'a@example.com' },
  });
});
afterEach(async () => app.close());

const deps = { db: testPool, clock, mailFrom: 'tickets@events.local' };

describe('mailer outbox', () => {
  it.each(['rescheduled event', 'cancelled registration'])(
    'marks a reminder for a %s as skipped without sending it',
    async (staleReason) => {
      const { rows } = await testPool.query<{ id: string; manage_token: string }>(
        `SELECT r.id, r.manage_token FROM registrations r
         JOIN outbox_emails o ON o.registration_id = r.id
         WHERE o.kind = 'ticket'`,
      );
      const registration = rows[0]!;
      await testPool.query(
        `UPDATE outbox_emails SET kind = 'reminder', schedule_version = 1
         WHERE registration_id = $1`,
        [registration.id],
      );
      if (staleReason === 'rescheduled event') {
        await testPool.query('UPDATE events SET schedule_version = 2');
      } else {
        await app.inject({ method: 'DELETE', url: `/api/tickets/${registration.manage_token}` });
        await testPool.query(
          `UPDATE outbox_emails SET sent_at = $1
           WHERE registration_id = $2 AND kind <> 'reminder'`,
          [clock.now(), registration.id],
        );
      }

      const sent: MailMessage[] = [];
      const transport = { send: async (message: MailMessage) => void sent.push(message) };
      expect(await runMailerTick(deps, transport)).toBe(1);
      expect(sent).toHaveLength(0);
      const { rows: reminders } = await testPool.query<{ marked_at: Date | null }>(
        `SELECT skipped_at AS marked_at FROM outbox_emails
         WHERE registration_id = $1 AND kind = 'reminder'`,
        [registration.id],
      );
      expect(reminders[0]?.marked_at).toEqual(clock.now());
    },
  );

  it('sends due mail once with a deterministic Message-ID', async () => {
    const sent: MailMessage[] = [];
    const transport = {
      send: async (message: MailMessage) => {
        sent.push(message);
      },
    };
    expect(await runMailerTick(deps, transport)).toBe(1);
    expect(await runMailerTick(deps, transport)).toBe(0);
    expect(sent).toHaveLength(1);
    const row = (
      await testPool.query<{ dedup_key: string; sent_at: Date }>(
        'SELECT dedup_key, sent_at FROM outbox_emails',
      )
    ).rows[0]!;
    expect(sent[0]?.messageId).toBe(`<${row.dedup_key}@events.local>`);
    expect(row.sent_at).toEqual(clock.now());
  });

  it('records failure and waits for exponential retry', async () => {
    const failure = {
      send: async () => {
        throw new Error('SMTP unavailable');
      },
    };
    expect(await runMailerTick(deps, failure)).toBe(1);
    const first = (
      await testPool.query<{
        attempts: number;
        last_error: string;
        next_attempt_at: Date;
        sent_at: Date | null;
      }>('SELECT attempts, last_error, next_attempt_at, sent_at FROM outbox_emails')
    ).rows[0]!;
    expect(first).toMatchObject({ attempts: 1, last_error: 'SMTP unavailable', sent_at: null });
    expect(first.next_attempt_at.getTime() - clock.now().getTime()).toBe(1000);
    expect(await runMailerTick(deps, failure)).toBe(0);
    clock.advance(1000);
    expect(await runMailerTick(deps, failure)).toBe(1);
    const second = (
      await testPool.query<{ attempts: number; next_attempt_at: Date }>(
        'SELECT attempts, next_attempt_at FROM outbox_emails',
      )
    ).rows[0]!;
    expect(second.attempts).toBe(2);
    expect(second.next_attempt_at.getTime() - clock.now().getTime()).toBe(2000);
  });

  it('uses SKIP LOCKED so concurrent ticks cannot send the same mail', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const sent: MailMessage[] = [];
    const transport = {
      send: async (message: MailMessage) => {
        sent.push(message);
        entered?.();
        await gate;
      },
    };
    const first = runMailerTick(deps, transport);
    await started;
    expect(await runMailerTick(deps, transport)).toBe(0);
    release?.();
    expect(await first).toBe(1);
    expect(sent).toHaveLength(1);
  });
});
