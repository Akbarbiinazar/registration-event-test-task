import type pg from 'pg';
import type { Db } from '../../db.js';

export interface RegistrationRow {
  id: string;
  event_id: string;
  email: string;
  status: 'confirmed' | 'waitlisted' | 'cancelled';
  ticket_code: string;
  manage_token: string;
  queue_seq: string;
}

export interface LockedEvent {
  id: string;
  title: string;
  starts_at: Date;
  timezone: string;
}

export interface TicketRow extends RegistrationRow {
  title: string;
  starts_at: Date;
  timezone: string;
  checked_in_at: Date | null;
}

export class RegistrationsRepository {
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

  async lockEvent(client: pg.PoolClient, id: string): Promise<LockedEvent | undefined> {
    const { rows } = await client.query<LockedEvent>(
      'SELECT id, title, starts_at, timezone FROM events WHERE id = $1 FOR UPDATE',
      [id],
    );
    return rows[0];
  }

  async insert(
    client: pg.PoolClient,
    input: { eventId: string; email: string; ticketCode: string; manageToken: string; now: Date },
  ): Promise<{ row?: RegistrationRow; collision: boolean }> {
    await client.query('SAVEPOINT ticket_code_attempt');
    try {
      const { rows } = await client.query<RegistrationRow>(
        `INSERT INTO registrations (event_id, email, status, ticket_code, manage_token, created_at)
       VALUES ($1, $2, 'waitlisted', $3, $4, $5)
       ON CONFLICT (event_id, email) WHERE status <> 'cancelled' DO NOTHING
       RETURNING id, event_id, email, status, ticket_code, manage_token, queue_seq`,
        [input.eventId, input.email, input.ticketCode, input.manageToken, input.now],
      );
      await client.query('RELEASE SAVEPOINT ticket_code_attempt');
      return { row: rows[0], collision: false };
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT ticket_code_attempt');
      await client.query('RELEASE SAVEPOINT ticket_code_attempt');
      const pgError = error as { code?: string; constraint?: string };
      if (
        pgError.code === '23505' &&
        (pgError.constraint === 'registrations_ticket_code_key' ||
          pgError.constraint === 'registrations_manage_token_key')
      ) {
        return { collision: true };
      }
      throw error;
    }
  }

  async activeByEmail(
    client: pg.PoolClient,
    eventId: string,
    email: string,
  ): Promise<RegistrationRow> {
    const { rows } = await client.query<RegistrationRow>(
      `SELECT id, event_id, email, status, ticket_code, manage_token, queue_seq FROM registrations
       WHERE event_id = $1 AND email = $2 AND status <> 'cancelled'`,
      [eventId, email],
    );
    const row = rows[0];
    if (!row) throw new Error('Active registration disappeared while event was locked');
    return row;
  }

  async takeSeat(client: pg.PoolClient, eventId: string): Promise<boolean> {
    const { rowCount } = await client.query(
      `UPDATE events SET seats_taken = seats_taken + 1
       WHERE id = $1 AND seats_taken < capacity RETURNING id`,
      [eventId],
    );
    return rowCount === 1;
  }

  async confirm(client: pg.PoolClient, id: string, now: Date): Promise<void> {
    await client.query(
      `UPDATE registrations SET status = 'confirmed', confirmed_at = $2 WHERE id = $1`,
      [id, now],
    );
  }

  async queueEmail(
    client: pg.PoolClient,
    input: {
      id: string;
      kind: 'waitlisted' | 'cancelled';
      email: string;
      subject: string;
      body: string;
      now: Date;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO outbox_emails
       (dedup_key, kind, registration_id, to_email, subject, body_text, created_at, next_attempt_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       ON CONFLICT (dedup_key) DO NOTHING`,
      [
        `${input.kind}:${input.id}`,
        input.kind,
        input.id,
        input.email,
        input.subject,
        input.body,
        input.now,
      ],
    );
  }

  async findByTokenInTransaction(
    client: pg.PoolClient,
    token: string,
  ): Promise<TicketRow | undefined> {
    const { rows } = await client.query<TicketRow>(
      `SELECT r.id, r.event_id, r.email, r.status, r.ticket_code, r.manage_token,
              r.queue_seq, r.checked_in_at, e.title, e.starts_at, e.timezone
       FROM registrations r JOIN events e ON e.id = r.event_id
       WHERE r.manage_token = $1`,
      [token],
    );
    return rows[0];
  }

  async position(client: pg.PoolClient, eventId: string, queueSeq: string): Promise<number> {
    const { rows } = await client.query<{ position: string }>(
      `SELECT count(*) AS position FROM registrations
       WHERE event_id = $1 AND status = 'waitlisted' AND queue_seq <= $2`,
      [eventId, queueSeq],
    );
    return Number(rows[0]?.position);
  }

  async waitlistPosition(eventId: string, queueSeq: string): Promise<number> {
    const { rows } = await this.db.query<{ position: string }>(
      `SELECT count(*) AS position FROM registrations
       WHERE event_id = $1 AND status = 'waitlisted' AND queue_seq <= $2`,
      [eventId, queueSeq],
    );
    return Number(rows[0]?.position);
  }

  async cancelRegistration(client: pg.PoolClient, id: string, now: Date): Promise<void> {
    await client.query(
      "UPDATE registrations SET status = 'cancelled', cancelled_at = $2 WHERE id = $1",
      [id, now],
    );
  }

  async firstWaitlisted(client: pg.PoolClient, eventId: string): Promise<TicketRow | undefined> {
    const { rows } = await client.query<TicketRow>(
      `SELECT r.id, r.event_id, r.email, r.status, r.ticket_code, r.manage_token,
              r.queue_seq, r.checked_in_at, e.title, e.starts_at, e.timezone
       FROM registrations r JOIN events e ON e.id = r.event_id
       WHERE r.event_id = $1 AND r.status = 'waitlisted'
       ORDER BY r.queue_seq LIMIT 1`,
      [eventId],
    );
    return rows[0];
  }

  async releaseSeat(client: pg.PoolClient, eventId: string): Promise<void> {
    await client.query('UPDATE events SET seats_taken = seats_taken - 1 WHERE id = $1', [eventId]);
  }

  async queueTicket(
    client: pg.PoolClient,
    input: { id: string; email: string; subject: string; body: string; now: Date },
  ): Promise<void> {
    await client.query(
      `INSERT INTO outbox_emails
       (dedup_key, kind, registration_id, to_email, subject, body_text, created_at, next_attempt_at)
       VALUES ($1, 'ticket', $2, $3, $4, $5, $6, $6)
       ON CONFLICT (dedup_key) DO NOTHING`,
      [`ticket:${input.id}`, input.id, input.email, input.subject, input.body, input.now],
    );
  }

  async notify(client: pg.PoolClient, eventId: string): Promise<void> {
    await client.query("SELECT pg_notify('event_stats', $1)", [eventId]);
  }

  async findByToken(token: string): Promise<TicketRow | undefined> {
    const { rows } = await this.db.query<TicketRow>(
      `SELECT r.id, r.event_id, r.email, r.status, r.ticket_code, r.manage_token,
              r.queue_seq, r.checked_in_at, e.title, e.starts_at, e.timezone
       FROM registrations r JOIN events e ON e.id = r.event_id
       WHERE r.manage_token = $1`,
      [token],
    );
    return rows[0];
  }
}
