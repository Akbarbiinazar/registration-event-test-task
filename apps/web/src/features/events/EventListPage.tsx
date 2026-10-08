import { useState } from 'react';
import { Link } from 'react-router';
import type { PublicEvent } from './events.types';
import { fetchEvents } from './events.api';
import { useLoad } from './useLoad';
import './event-list.css';

function eventDate(event: PublicEvent) {
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: event.timezone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).formatToParts(new Date(event.startsAt));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return { day: get('day'), month: get('month'), year: get('year') };
}

function eventTime(event: PublicEvent) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: event.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(event.startsAt));
}

function EventRow({ event }: { event: PublicEvent }) {
  const date = eventDate(event);
  const zone = event.startsAtLabel.match(/\(([^)]+)\)$/)?.[1] ?? event.timezone;
  return (
    <li className="event-list-item">
      <Link
        className="event-row"
        to={`/e/${event.id}`}
        aria-label={`${event.title} — ${event.startsAtLabel}`}
      >
        <span className="event-date" aria-hidden="true">
          <strong>{date.day}</strong>
          <span>{date.month}</span>
          <small>{date.year}</small>
        </span>
        <span className="event-row-title">{event.title}</span>
        <span className="event-row-time" aria-hidden="true">
          <strong>{eventTime(event)}</strong>
          <span className="event-zone">{zone}</span>
        </span>
        <span className="event-row-arrow" aria-hidden="true">
          ↗
        </span>
      </Link>
    </li>
  );
}

export function EventListPage() {
  const [retry, setRetry] = useState(0);
  const state = useLoad((signal) => fetchEvents(signal), [retry]);
  return (
    <section className="event-list-page">
      <header className="event-list-header">
        <div>
          <p className="event-list-eyebrow">Календарь встреч</p>
          <h1>Предстоящие события</h1>
          <p className="event-list-intro">
            Выберите встречу, чтобы узнать подробности и записаться.
          </p>
        </div>
        <Link className="primary-action" to="/events/new">
          Создать событие
        </Link>
      </header>

      {state.kind === 'loading' && (
        <div role="status" aria-label="Загрузка событий">
          <span className="visually-hidden">Загрузка событий…</span>
          <div className="event-skeleton-list" aria-hidden="true">
            {[0, 1, 2].map((item) => (
              <div className="event-row event-skeleton" key={item}>
                <span className="event-skeleton-date" />
                <span className="event-skeleton-title" />
                <span className="event-skeleton-time" />
              </div>
            ))}
          </div>
        </div>
      )}
      {state.kind === 'error' && (
        <div className="event-list-state" role="alert">
          <h2>События не загрузились</h2>
          <p>{state.message}</p>
          <button
            type="button"
            className="secondary-action"
            onClick={() => setRetry((value) => value + 1)}
          >
            Повторить загрузку
          </button>
        </div>
      )}
      {state.kind === 'ok' && state.data.length === 0 && (
        <div className="event-list-state">
          <h2>Пока нет предстоящих событий</h2>
          <p>Создайте первую встречу и пригласите участников.</p>
          <Link className="primary-action" to="/events/new">
            Создать событие
          </Link>
        </div>
      )}
      {state.kind === 'ok' && state.data.length > 0 && (
        <ul className="event-list">
          {state.data.map((event) => (
            <EventRow event={event} key={event.id} />
          ))}
        </ul>
      )}
    </section>
  );
}
