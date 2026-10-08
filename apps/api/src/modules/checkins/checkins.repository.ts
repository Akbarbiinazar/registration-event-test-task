import type pg from 'pg';
import type { Db } from '../../db.js';

interface TicketState {
  status: 'confirmed' | 'waitlisted' | 'cancelled';
  checked_in_at: Date | null;
}

export class CheckinsRepository {
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

  async lockEvent(client: pg.PoolClient, eventId: string): Promise<void> {
    await client.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [eventId]);
  }

  async checkIn(
    client: pg.PoolClient,
    eventId: string,
    code: string,
    now: Date,
  ): Promise<Date | undefined> {
    const { rows } = await client.query<{ checked_in_at: Date }>(
      `UPDATE registrations SET checked_in_at = $3
       WHERE event_id = $1 AND ticket_code = $2 AND status = 'confirmed' AND checked_in_at IS NULL
       RETURNING checked_in_at`,
      [eventId, code, now],
    );
    return rows[0]?.checked_in_at;
  }

  async findTicket(
    client: pg.PoolClient,
    eventId: string,
    code: string,
  ): Promise<TicketState | undefined> {
    const { rows } = await client.query<TicketState>(
      'SELECT status, checked_in_at FROM registrations WHERE event_id = $1 AND ticket_code = $2',
      [eventId, code],
    );
    return rows[0];
  }

  async notify(client: pg.PoolClient, eventId: string): Promise<void> {
    await client.query("SELECT pg_notify('event_stats', $1)", [eventId]);
  }
}
