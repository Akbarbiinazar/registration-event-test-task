import { Link, useParams } from 'react-router';
import { fetchOrganizerEvent } from './events.api';
import { useLoad } from './useLoad';

/** The key lives in the URL fragment, so it is never sent to a server except as a Bearer header. */
function readKey(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get('key') ?? '';
}

export function OrganizerPage() {
  const { id = '' } = useParams();
  const state = useLoad((signal) => fetchOrganizerEvent(id, readKey(), signal), [id]);
  if (state.kind === 'loading') return <p>Загрузка…</p>;
  if (state.kind === 'error') {
    return (
      <p role="alert">
        {state.status === 401 ? 'Неверная или отсутствующая ссылка организатора' : state.message}
      </p>
    );
  }
  const { event, stats } = state.data;
  return (
    <article>
      <h1>{event.title} — организатор</h1>
      {event.hasStarted && <p role="status">Событие уже идёт</p>}
      <p>{event.startsAtLabel}</p>
      <p>
        <Link to={`/o/${id}/checkin${window.location.hash}`}>Открыть экран чекина</Link>
      </p>
      <ul>
        <li>
          Зарегистрировано: {stats.registered} из {stats.capacity}
        </li>
        <li>В листе ожидания: {stats.waitlisted}</li>
        <li>Пришло: {stats.checkedIn}</li>
      </ul>
    </article>
  );
}
