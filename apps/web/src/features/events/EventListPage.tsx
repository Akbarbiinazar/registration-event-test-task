import { useState } from 'react';
import { Link } from 'react-router';
import type { PublicEvent } from './events.types';
import { fetchEvents } from './events.api';
import { useLoad } from './useLoad';
import { EventDateTime } from '@/shared/ui/EventDateTime';
import './event-list.css';

function EventRow({ event }: { event: PublicEvent }) {
  return (
    <li className="event-list-item">
      <Link
        className="event-row"
        to={`/e/${event.id}`}
        aria-label={`${event.title} — ${event.startsAtLabel}`}
      >
        <EventDateTime
          startsAt={event.startsAt}
          startsAtLabel={event.startsAtLabel}
          timezone={event.timezone}
        />
        <span className="event-row-title">{event.title}</span>
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
