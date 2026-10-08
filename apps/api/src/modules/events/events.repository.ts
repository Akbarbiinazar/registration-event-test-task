import type { Db } from '../../db.js';
import type pg from 'pg';

export interface EventRow {
  id: string;
  title: string;
  description: string;
  starts_at: Date;
  timezone: string;
  capacity: number;
  seats_taken: number;
  organizer_token_hash: string;
}

const COLUMNS =
  'id, title, description, starts_at, timezone, capacity, seats_taken, organizer_token_hash';

export interface NewEvent {
  title: string;
  description: string;
  startsAt: Date;
  timezone: string;
  capacity: number;
  organizerTokenHash: string;
  now: Date;
}

export interface EventStats {
  registered: number;
  waitlisted: number;
  checkedIn: number;
  capacity: number;
}

export class EventsRepository {
  constructor(private readonly db: Db) {}

  async transaction<T>(work: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async lockForUpdate(
    client: pg.PoolClient,
    id: string,
  ): Promise<(EventRow & { schedule_version: number }) | undefined> {
    const { rows } = await client.query<EventRow & { schedule_version: number }>(
      `SELECT ${COLUMNS}, schedule_version FROM events WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return rows[0];
  }

  async updateMetadata(
    client: pg.PoolClient,
    id: string,
    title: string | undefined,
    description: string | undefined,
    now: Date,
  ): Promise<void> {
    await client.query(
      `UPDATE events SET title = COALESCE($2, title), description = COALESCE($3, description), updated_at = $4 WHERE id = $1`,
      [id, title ?? null, description ?? null, now],
    );
  }

  async reschedule(client: pg.PoolClient, id: string, startsAt: Date, now: Date): Promise<number> {
    const { rows } = await client.query<{ schedule_version: number }>(
      `UPDATE events SET starts_at = $2, schedule_version = schedule_version + 1, updated_at = $3 WHERE id = $1 RETURNING schedule_version`,
      [id, startsAt, now],
    );
    return rows[0]!.schedule_version;
  }

  async queueRescheduled(
    client: pg.PoolClient,
    input: {
      id: string;
      email: string;
      scheduleVersion: number;
      subject: string;
      body: string;
      now: Date;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO outbox_emails (dedup_key, kind, registration_id, to_email, subject, body_text, schedule_version, created_at, next_attempt_at)
       VALUES ($1, 'rescheduled', $2, $3, $4, $5, $6, $7, $7) ON CONFLICT (dedup_key) DO NOTHING`,
      [
        `rescheduled:${input.id}:${input.scheduleVersion}`,
        input.id,
        input.email,
        input.subject,
        input.body,
        input.scheduleVersion,
        input.now,
      ],
    );
  }

  async activeRegistrations(
    client: pg.PoolClient,
    eventId: string,
  ): Promise<{ id: string; email: string; status: string }[]> {
    const { rows } = await client.query<{ id: string; email: string; status: string }>(
      `SELECT id, email, status FROM registrations WHERE event_id = $1 AND status IN ('confirmed', 'waitlisted')`,
      [eventId],
    );
    return rows;
  }

  async notify(client: pg.PoolClient, eventId: string): Promise<void> {
    await client.query("SELECT pg_notify('event_stats', $1)", [eventId]);
  }

  async insert(e: NewEvent): Promise<EventRow> {
    const { rows } = await this.db.query<EventRow>(
      `INSERT INTO events (title, description, starts_at, timezone, capacity, organizer_token_hash, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       RETURNING ${COLUMNS}`,
      [e.title, e.description, e.startsAt, e.timezone, e.capacity, e.organizerTokenHash, e.now],
    );
    return rows[0] as EventRow;
  }

  async findById(id: string): Promise<EventRow | undefined> {
    const { rows } = await this.db.query<EventRow>(`SELECT ${COLUMNS} FROM events WHERE id = $1`, [
      id,
    ]);
    return rows[0];
  }

  async listUpcoming(now: Date): Promise<EventRow[]> {
    const { rows } = await this.db.query<EventRow>(
      `SELECT ${COLUMNS} FROM events WHERE starts_at > $1 ORDER BY starts_at, id`,
      [now],
    );
    return rows;
  }

  async stats(id: string): Promise<EventStats> {
    const { rows } = await this.db.query<{
      registered: string;
      waitlisted: string;
      checked_in: string;
      capacity: number;
    }>(
      `SELECT e.capacity,
              count(r.id) FILTER (WHERE r.status = 'confirmed') AS registered,
              count(r.id) FILTER (WHERE r.status = 'waitlisted') AS waitlisted,
              count(r.id) FILTER (WHERE r.checked_in_at IS NOT NULL) AS checked_in
       FROM events e LEFT JOIN registrations r ON r.event_id = e.id
       WHERE e.id = $1 GROUP BY e.id`,
      [id],
    );
    const row = rows[0];
    if (!row) throw new Error('Authorized event disappeared');
    return {
      registered: Number(row.registered),
      waitlisted: Number(row.waitlisted),
      checkedIn: Number(row.checked_in),
      capacity: row.capacity,
    };
  }
}
