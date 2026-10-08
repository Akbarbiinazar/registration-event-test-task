import { randomBytes, randomInt } from 'node:crypto';
import type { Clock } from '../../clock.js';
import type { Config } from '../../config.js';
import { AppError } from '../../errors.js';
import { formatInZone } from '../../format.js';
import { RegistrationsRepository } from './registrations.repository.js';
import type { LockedEvent, TicketRow } from './registrations.repository.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const MANAGE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

function ticketCode(): string {
  return Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
}

export class RegistrationsService {
  constructor(
    private readonly repository: RegistrationsRepository,
    private readonly clock: Clock,
    private readonly config: Config,
  ) {}

  private ticketBody(
    row: { ticket_code: string; manage_token: string },
    event: LockedEvent,
  ): string {
    const displayCode = `${row.ticket_code.slice(0, 4)}-${row.ticket_code.slice(4)}`;
    return `Вы зарегистрированы на «${event.title}».\nДата: ${formatInZone(event.starts_at, event.timezone)}\nКод билета: ${displayCode}\nВаш билет: ${this.config.WEB_BASE_URL.replace(/\/$/, '')}/t/${row.manage_token}\n`;
  }

  async register(
    eventId: string,
    rawEmail: string,
  ): Promise<{
    status: 'confirmed' | 'waitlisted';
    alreadyRegistered: boolean;
  }> {
    const email = rawEmail.trim().toLowerCase();
    if (!EMAIL.test(email) || email.length > 320) {
      throw new AppError(400, 'validation_error', 'Укажите корректный email');
    }
    if (!UUID.test(eventId)) throw new AppError(404, 'not_found', 'Событие не найдено');
    const now = this.clock.now();
    return this.repository.transaction(async (client) => {
      const event = await this.repository.lockEvent(client, eventId);
      if (!event) throw new AppError(404, 'not_found', 'Событие не найдено');

      for (let attempt = 0; attempt < 10; attempt += 1) {
        const inserted = await this.repository.insert(client, {
          eventId,
          email,
          ticketCode: ticketCode(),
          manageToken: randomBytes(32).toString('base64url'),
          now,
        });
        if (inserted.collision) continue;
        if (!inserted.row) {
          const existing = await this.repository.activeByEmail(client, eventId, email);
          return { status: existing.status as 'confirmed' | 'waitlisted', alreadyRegistered: true };
        }
        const registration = inserted.row;
        const hasSeat = await this.repository.takeSeat(client, eventId);
        if (hasSeat) {
          await this.repository.confirm(client, registration.id, now);
          await this.repository.queueTicket(client, {
            id: registration.id,
            email,
            subject: `Билет на событие «${event.title}»`,
            body: this.ticketBody(registration, event),
            now,
          });
        } else {
          const position = await this.repository.position(client, eventId, registration.queue_seq);
          await this.repository.queueEmail(client, {
            id: registration.id,
            kind: 'waitlisted',
            email,
            subject: `Лист ожидания события «${event.title}»`,
            body: `Вы в листе ожидания события «${event.title}».\nДата: ${formatInZone(event.starts_at, event.timezone)}\nВаша позиция: ${position}.\nУправление регистрацией и отказ: ${this.config.WEB_BASE_URL.replace(/\/$/, '')}/t/${registration.manage_token}\n`,
            now,
          });
        }
        await this.repository.notify(client, eventId);
        return { status: hasSeat ? 'confirmed' : 'waitlisted', alreadyRegistered: false };
      }
      throw new Error('Could not generate a unique ticket code');
    });
  }

  async ticket(token: string): Promise<{
    event: { id: string; title: string; startsAtLabel: string };
    status: 'confirmed' | 'waitlisted' | 'cancelled';
    code?: string;
    position?: number;
  }> {
    if (!MANAGE_TOKEN.test(token)) {
      throw new AppError(404, 'not_found', 'Билет не найден');
    }
    const row = await this.repository.findByToken(token);
    if (!row) throw new AppError(404, 'not_found', 'Билет не найден');
    const position =
      row.status === 'waitlisted'
        ? await this.repository.waitlistPosition(row.event_id, row.queue_seq)
        : undefined;
    return {
      event: {
        id: row.event_id,
        title: row.title,
        startsAtLabel: formatInZone(row.starts_at, row.timezone),
      },
      status: row.status,
      ...(row.status === 'confirmed'
        ? { code: `${row.ticket_code.slice(0, 4)}-${row.ticket_code.slice(4)}` }
        : {}),
      ...(position === undefined ? {} : { position }),
    };
  }

  async cancel(token: string): Promise<{ status: 'cancelled' }> {
    if (!MANAGE_TOKEN.test(token)) throw new AppError(404, 'not_found', 'Билет не найден');
    const found = await this.repository.findByToken(token);
    if (!found) throw new AppError(404, 'not_found', 'Билет не найден');
    const now = this.clock.now();
    return this.repository.transaction(async (client) => {
      const event = await this.repository.lockEvent(client, found.event_id);
      if (!event) throw new AppError(404, 'not_found', 'Билет не найден');
      const row: TicketRow | undefined = await this.repository.findByTokenInTransaction(
        client,
        token,
      );
      if (!row) throw new AppError(404, 'not_found', 'Билет не найден');
      if (row.status === 'cancelled') return { status: 'cancelled' };
      if (row.checked_in_at)
        throw new AppError(409, 'already_checked_in', 'Билет уже прошёл чекин');
      try {
        await this.repository.cancelRegistration(client, row.id, now);
      } catch (error) {
        const pgError = error as { code?: string; constraint?: string };
        if (pgError.code === '23514' && pgError.constraint === 'checked_in_requires_confirmation') {
          throw new AppError(409, 'already_checked_in', 'Билет уже прошёл чекин');
        }
        throw error;
      }
      await this.repository.queueEmail(client, {
        id: row.id,
        kind: 'cancelled',
        email: row.email,
        subject: `Отказ от события «${event.title}» принят`,
        body: `Ваш отказ от участия в событии «${event.title}» принят.\nДата события: ${formatInZone(event.starts_at, event.timezone)}\n`,
        now,
      });
      if (row.status === 'confirmed') {
        const next = await this.repository.firstWaitlisted(client, row.event_id);
        if (next) {
          await this.repository.confirm(client, next.id, now);
          await this.repository.queueTicket(client, {
            id: next.id,
            email: next.email,
            subject: `Билет на событие «${event.title}»`,
            body: this.ticketBody(next, event),
            now,
          });
        } else {
          await this.repository.releaseSeat(client, row.event_id);
        }
      }
      await this.repository.notify(client, row.event_id);
      return { status: 'cancelled' };
    });
  }
}
