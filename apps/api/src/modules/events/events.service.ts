import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Clock } from '../../clock.js';
import { AppError } from '../../errors.js';
import { formatInZone, isValidTimezone } from '../../format.js';
import type { EventRow, EventsRepository } from './events.repository.js';

export interface PublicEvent {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  startsAtLabel: string;
  timezone: string;
  capacity: number;
  seatsLeft: number;
  hasStarted: boolean;
}

export interface CreateEventInput {
  title: string;
  description?: string;
  startsAt: string;
  timezone: string;
  capacity: number;
}

export interface UpdateEventInput {
  startsAt?: string;
  title?: string;
  description?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha256 = (value: string): Buffer => createHash('sha256').update(value).digest();

export class EventsService {
  constructor(
    private readonly repository: EventsRepository,
    private readonly clock: Clock,
  ) {}

  async create(input: CreateEventInput): Promise<{ event: PublicEvent; organizerKey: string }> {
    const now = this.clock.now();
    const startsAt = new Date(input.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new AppError(400, 'validation_error', 'Укажите корректную дату начала');
    }
    if (startsAt.getTime() <= now.getTime()) {
      throw new AppError(400, 'validation_error', 'Дата начала должна быть в будущем');
    }
    if (!isValidTimezone(input.timezone)) {
      throw new AppError(400, 'validation_error', 'Неизвестный часовой пояс');
    }
    const organizerKey = randomBytes(32).toString('base64url');
    const row = await this.repository.insert({
      title: input.title.trim(),
      description: input.description ?? '',
      startsAt,
      timezone: input.timezone,
      capacity: input.capacity,
      organizerTokenHash: sha256(organizerKey).toString('hex'),
      now,
    });
    return { event: this.toPublic(row), organizerKey };
  }

  async list(): Promise<PublicEvent[]> {
    const rows = await this.repository.listUpcoming(this.clock.now());
    return rows.map((r) => this.toPublic(r));
  }

  async get(id: string): Promise<PublicEvent> {
    const row = await this.findExisting(id);
    if (!row) throw new AppError(404, 'not_found', 'Событие не найдено');
    return this.toPublic(row);
  }

  /** Same 401 for missing event, missing key and wrong key: nothing leaks about existence. */
  async getForOrganizer(id: string, authorization: string | undefined) {
    const row = await this.authorize(id, authorization);
    return { event: this.toPublic(row), stats: await this.repository.stats(row.id) };
  }

  async statsForOrganizer(id: string, key: string | undefined) {
    const row = await this.authorize(id, key ? `Bearer ${key}` : undefined);
    return this.repository.stats(row.id);
  }

  async stats(id: string) {
    return this.repository.stats(id);
  }

  async updateForOrganizer(
    id: string,
    authorization: string | undefined,
    input: UpdateEventInput,
  ): Promise<{ unchanged?: true }> {
    await this.authorize(id, authorization);
    const now = this.clock.now();
    const startsAt = input.startsAt === undefined ? undefined : new Date(input.startsAt);
    if (startsAt && Number.isNaN(startsAt.getTime()))
      throw new AppError(400, 'validation_error', 'Укажите корректную дату начала');
    if (startsAt && startsAt.getTime() <= now.getTime())
      throw new AppError(400, 'validation_error', 'Нельзя перенести на прошедшее время');
    return this.repository.transaction(async (client) => {
      const event = await this.repository.lockForUpdate(client, id);
      if (!event) throw new AppError(401, 'unauthorized', 'Нужна ссылка организатора');
      await this.repository.updateMetadata(client, id, input.title?.trim(), input.description, now);
      if (startsAt && startsAt.getTime() === event.starts_at.getTime()) return { unchanged: true };
      if (startsAt) {
        const scheduleVersion = await this.repository.reschedule(client, id, startsAt, now);
        for (const registration of await this.repository.activeRegistrations(client, id)) {
          const waitlisted = registration.status === 'waitlisted';
          await this.repository.queueRescheduled(client, {
            id: registration.id,
            email: registration.email,
            scheduleVersion,
            subject: `Перенос события «${event.title}»`,
            body: waitlisted
              ? `Событие «${event.title}» перенесено. Ваша запись в листе ожидания сохранена.\nБыло: ${formatInZone(event.starts_at, event.timezone)}\nСтало: ${formatInZone(startsAt, event.timezone)}\n`
              : `Событие «${event.title}» перенесено.\nБыло: ${formatInZone(event.starts_at, event.timezone)}\nСтало: ${formatInZone(startsAt, event.timezone)}\n`,
            now,
          });
        }
        await this.repository.notify(client, id);
      }
      return {};
    });
  }

  private async authorize(id: string, authorization: string | undefined): Promise<EventRow> {
    const row = await this.findExisting(id);
    const key = authorization?.match(/^Bearer (.+)$/i)?.[1];
    const expected = Buffer.from(row?.organizer_token_hash ?? '0'.repeat(64), 'hex');
    const keyMatches = key !== undefined && timingSafeEqual(sha256(key), expected);
    if (!row || !keyMatches) {
      throw new AppError(401, 'unauthorized', 'Нужна ссылка организатора');
    }
    return row;
  }

  /** A malformed id is an event that does not exist; it never reaches the uuid column. */
  private findExisting(id: string): Promise<EventRow | undefined> {
    return UUID.test(id) ? this.repository.findById(id) : Promise.resolve(undefined);
  }

  private toPublic(row: EventRow): PublicEvent {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      startsAt: row.starts_at.toISOString(),
      startsAtLabel: formatInZone(row.starts_at, row.timezone),
      timezone: row.timezone,
      capacity: row.capacity,
      seatsLeft: row.capacity - row.seats_taken,
      hasStarted: row.starts_at.getTime() <= this.clock.now().getTime(),
    };
  }
}
