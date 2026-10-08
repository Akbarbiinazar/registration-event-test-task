import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { fetchOrganizerEvent } from './events.api';
import type { OrganizerEvent } from './events.types';
import { useLoad } from './useLoad';

/** The key lives in the URL fragment, so it is never sent to a server except as a Bearer header. */
function readKey(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get('key') ?? '';
}

export function OrganizerPage() {
  const { id = '' } = useParams();
  const state = useLoad((signal) => fetchOrganizerEvent(id, readKey(), signal), [id]);
  const [stats, setStats] = useState<OrganizerEvent['stats'] | null>(null);
  const [connection, setConnection] = useState<'reconnecting' | 'live'>('reconnecting');
  useEffect(() => {
    if (state.kind !== 'ok') return;
    const source = new EventSource(
      `/api/organizer/events/${id}/stream?key=${encodeURIComponent(readKey())}`,
    );
    source.onopen = () => setConnection('live');
    source.onerror = () => setConnection('reconnecting');
    source.onmessage = (message) => {
      setStats(JSON.parse(message.data) as OrganizerEvent['stats']);
    };
    return () => source.close();
  }, [id, state.kind]);
  if (state.kind === 'loading') return <p>Загрузка…</p>;
  if (state.kind === 'error') {
    return (
      <p role="alert">
        {state.status === 401 ? 'Неверная или отсутствующая ссылка организатора' : state.message}
      </p>
    );
  }
  const { event } = state.data;
  const current = stats ?? state.data.stats;
  return (
    <article>
      <h1>{event.title} — организатор</h1>
      {event.hasStarted && <p role="status">Событие уже идёт</p>}
      <p>{event.startsAtLabel}</p>
      <p role="status" aria-live="polite">
        {connection === 'live' ? '● live' : 'Переподключение…'}
      </p>
      <p>
        <Link to={`/o/${id}/checkin${window.location.hash}`}>Открыть экран чекина</Link>
      </p>
      <ul className="organizer-stats">
        <li>
          <strong>{current.registered}</strong>
          <span>Зарегистрировано</span>
        </li>
        <li>
          <strong>{current.waitlisted}</strong>
          <span>В листе ожидания</span>
        </li>
        <li>
          <strong>{current.checkedIn}</strong>
          <span>Пришло</span>
        </li>
        <li>
          <strong>{current.capacity - current.registered}</strong>
          <span>Мест осталось</span>
        </li>
      </ul>
    </article>
  );
}
