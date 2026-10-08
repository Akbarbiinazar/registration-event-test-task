import { Link, useLocation } from 'react-router';
import type { CreatedEvent } from './events.types';
import './create-event.css';

export function EventCreatedPage() {
  const created = useLocation().state as CreatedEvent | null;
  if (!created) {
    return (
      <section className="created-event-page">
        <h1>Ссылка организатора больше недоступна</h1>
        <p>Ссылка показывается один раз сразу после создания.</p>
        <Link className="secondary-action" to="/">
          На главную
        </Link>
      </section>
    );
  }
  const { event, organizerKey } = created;
  const publicUrl = `${window.location.origin}/e/${event.id}`;
  const organizerUrl = `${window.location.origin}/o/${event.id}#key=${organizerKey}`;
  return (
    <section className="created-event-page">
      <p className="event-list-eyebrow">Готово</p>
      <h1>Событие создано: {event.title}</h1>
      <p role="status" aria-live="polite">
        Событие создано. Сохраните ссылку организатора.
      </p>
      <p>{event.startsAtLabel}</p>
      <div className="created-link">
        <h2>Публичная ссылка</h2>
        <a href={publicUrl}>{publicUrl}</a>
      </div>
      <div className="created-link">
        <h2>Ссылка организатора</h2>
        <a href={organizerUrl}>{organizerUrl}</a>
      </div>
      <p className="created-note" role="note">
        Сохраните ссылку организатора — больше мы её не покажем. По ней открываются экран
        организатора и чекин.
      </p>
      <Link className="secondary-action" to={`/e/${event.id}`}>
        Открыть событие
      </Link>
    </section>
  );
}
