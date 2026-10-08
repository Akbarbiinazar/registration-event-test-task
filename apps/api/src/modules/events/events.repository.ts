import type { Db } from '../../db.js';

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
