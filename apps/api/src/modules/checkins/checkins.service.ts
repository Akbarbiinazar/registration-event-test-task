import type { Clock } from '../../clock.js';
import { AppError } from '../../errors.js';
import type { EventsService } from '../events/events.service.js';
import { CheckinsRepository } from './checkins.repository.js';

const CODE = /^[0-9A-HJKMNP-TV-Z]{8}$/;

export class CheckinsService {
  constructor(
    private readonly repository: CheckinsRepository,
    private readonly events: EventsService,
    private readonly clock: Clock,
  ) {}

  async checkIn(
    eventId: string,
    rawCode: string,
    authorization: string | undefined,
  ): Promise<{ checkedInAt: string }> {
    const { event } = await this.events.getForOrganizer(eventId, authorization);
    const code = rawCode
      .toUpperCase()
      .replace(/[\s-]/g, '')
      .replace(/O/g, '0')
      .replace(/[IL]/g, '1');
    if (!CODE.test(code)) throw new AppError(404, 'ticket_not_found', 'Билет не найден');
    const now = this.clock.now();
    return this.repository.transaction(async (client) => {
      await this.repository.lockEvent(client, eventId);
      const checkedInAt = await this.repository.checkIn(client, eventId, code, now);
      if (checkedInAt) {
        await this.repository.notify(client, eventId);
        return { checkedInAt: checkedInAt.toISOString() };
      }
      const ticket = await this.repository.findTicket(client, eventId, code);
      if (!ticket) throw new AppError(404, 'ticket_not_found', 'Билет не найден');
      if (ticket.checked_in_at) {
        const time = new Intl.DateTimeFormat('ru-RU', {
          timeZone: event.timezone,
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).format(ticket.checked_in_at);
        throw new AppError(
          409,
          'already_checked_in',
          `Уже прошёл в ${time}`,
          ticket.checked_in_at.toISOString(),
        );
      }
      throw new AppError(409, 'ticket_not_active', 'Билет не активен');
    });
  }
}
