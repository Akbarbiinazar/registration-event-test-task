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
}
