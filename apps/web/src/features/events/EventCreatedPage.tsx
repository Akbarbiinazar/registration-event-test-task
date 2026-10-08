import { Link, useLocation } from 'react-router';
import type { CreatedEvent } from './events.types';

export function EventCreatedPage() {
  const created = useLocation().state as CreatedEvent | null;
  if (!created) {
    return (
      <p>
        Ссылка организатора показывается один раз сразу после создания.{' '}
        <Link to="/">На главную</Link>
      </p>
    );
  }
  const { event, organizerKey } = created;
  const publicUrl = `${window.location.origin}/e/${event.id}`;
  const organizerUrl = `${window.location.origin}/o/${event.id}#key=${organizerKey}`;
  return (
    <section>
      <h1>Событие создано: {event.title}</h1>
      <p>{event.startsAtLabel}</p>
      <h2>Публичная ссылка</h2>
      <p>
        <a href={publicUrl}>{publicUrl}</a>
      </p>
      <h2>Ссылка организатора</h2>
      <p>
        <a href={organizerUrl}>{organizerUrl}</a>
      </p>
      <p role="note" style={{ color: 'var(--color-error)' }}>
        Сохраните ссылку организатора — больше мы её не покажем. По ней открываются экран
        организатора и чекин.
      </p>
    </section>
  );
}
