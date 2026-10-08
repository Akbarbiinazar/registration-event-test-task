import type { Clock } from '../clock.js';
import type { Db } from '../db.js';

export interface MailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  messageId: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

interface DueEmail {
  id: string;
  dedup_key: string;
  kind: string;
  schedule_version: number | null;
  event_schedule_version: number;
  registration_status: string;
  to_email: string;
  subject: string;
  body_text: string;
  attempts: number;
}

function retryAt(now: Date, attempts: number): Date {
  const delay = Math.min(3_600_000, 1000 * 2 ** Math.min(attempts - 1, 12));
  return new Date(now.getTime() + delay);
}

export async function runMailerTick(
  deps: { db: Db; clock: Clock; mailFrom: string },
  transport: MailTransport,
): Promise<number> {
  const now = deps.clock.now();
  const client = await deps.db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<DueEmail>(
      `SELECT o.id, o.dedup_key, o.kind, o.schedule_version,
              e.schedule_version AS event_schedule_version, r.status AS registration_status,
              o.to_email, o.subject, o.body_text, o.attempts
       FROM outbox_emails o
       JOIN registrations r ON r.id = o.registration_id
       JOIN events e ON e.id = r.event_id
       WHERE o.sent_at IS NULL AND o.skipped_at IS NULL AND o.next_attempt_at <= $1
       ORDER BY o.next_attempt_at, o.id
       LIMIT 10 FOR UPDATE OF o SKIP LOCKED`,
      [now],
    );
    for (const row of rows) {
      if (
        row.kind === 'reminder' &&
        (row.schedule_version !== row.event_schedule_version ||
          row.registration_status !== 'confirmed')
      ) {
        await client.query('UPDATE outbox_emails SET skipped_at = $2 WHERE id = $1', [row.id, now]);
        continue;
      }
      try {
        await transport.send({
          from: deps.mailFrom,
          to: row.to_email,
          subject: row.subject,
          text: row.body_text,
          messageId: `<${row.dedup_key}@events.local>`,
        });
        await client.query(
          'UPDATE outbox_emails SET sent_at = $2, last_error = NULL WHERE id = $1',
          [row.id, now],
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await client.query(
          `UPDATE outbox_emails
           SET attempts = attempts + 1, last_error = $2, next_attempt_at = $3
           WHERE id = $1`,
          [row.id, message.slice(0, 2000), retryAt(now, row.attempts + 1)],
        );
      }
    }
    await client.query('COMMIT');
    return rows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
