import { Link } from 'react-router';
import { fetchEvents } from './events.api';
import { useLoad } from './useLoad';

export function EventListPage() {
  const state = useLoad((signal) => fetchEvents(signal), []);
  return (
    <section>
      <h1>Предстоящие события</h1>
      <p>
        <Link to="/events/new">Создать событие</Link>
      </p>
      {state.kind === 'loading' && <p>Загрузка…</p>}
      {state.kind === 'error' && <p role="alert">{state.message}</p>}
      {state.kind === 'ok' && state.data.length === 0 && <p>Пока нет предстоящих событий.</p>}
      {state.kind === 'ok' && (
        <ul>
          {state.data.map((e) => (
            <li key={e.id}>
              <Link to={`/e/${e.id}`}>{e.title}</Link> — {e.startsAtLabel}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
