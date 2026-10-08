import type { Clock } from '../clock.js';
import type { Db } from '../db.js';
import { formatInZone } from '../format.js';

interface ReminderCandidate {
  registration_id: string;
  email: string;
  title: string;
  starts_at: Date;
  timezone: string;
  schedule_version: number;
}

export async function runReminderTick(deps: { db: Db; clock: Clock }): Promise<number> {
  const now = deps.clock.now();
  const { rows: candidates } = await deps.db.query<ReminderCandidate>(
    `SELECT r.id AS registration_id, r.email, e.title, e.starts_at, e.timezone,
            e.schedule_version
     FROM registrations r
     JOIN events e ON e.id = r.event_id
     WHERE r.status = 'confirmed'
       AND e.starts_at > $1
       AND e.starts_at <= $1 + interval '24 hours'
     ORDER BY e.starts_at, r.id`,
    [now],
  );
  if (candidates.length === 0) return 0;

  const messages = candidates.map((candidate) => ({
    dedup_key: `reminder:${candidate.registration_id}:${candidate.schedule_version}`,
    registration_id: candidate.registration_id,
    schedule_version: candidate.schedule_version,
    to_email: candidate.email,
    subject: `Напоминание о событии «${candidate.title}»`,
    body_text: `Напоминаем, что скоро состоится событие «${candidate.title}».\n\nДата и время: ${formatInZone(candidate.starts_at, candidate.timezone)}.`,
  }));
  const result = await deps.db.query(
    `INSERT INTO outbox_emails
       (dedup_key, kind, registration_id, schedule_version, to_email, subject, body_text,
        created_at, next_attempt_at)
     SELECT reminder.dedup_key, 'reminder', reminder.registration_id,
            reminder.schedule_version, reminder.to_email, reminder.subject, reminder.body_text,
            $1, $1
     FROM jsonb_to_recordset($2::jsonb) AS reminder(
       dedup_key text, registration_id uuid, schedule_version int, to_email text,
       subject text, body_text text
     )
     ON CONFLICT (dedup_key) DO NOTHING
     RETURNING id`,
    [now, JSON.stringify(messages)],
  );
  return result.rowCount ?? 0;
}
