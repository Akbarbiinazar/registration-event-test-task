import { useParams } from 'react-router';
import { fetchEvent } from './events.api';
import { useLoad } from './useLoad';

export function PublicEventPage() {
  const { id = '' } = useParams();
  const state = useLoad((signal) => fetchEvent(id, signal), [id]);
  if (state.kind === 'loading') return <p>Загрузка…</p>;
  if (state.kind === 'error') {
    return <p role="alert">{state.status === 404 ? 'Событие не найдено' : state.message}</p>;
  }
  const e = state.data;
  return (
    <article>
      <h1>{e.title}</h1>
      {e.hasStarted && <p role="status">Событие уже идёт</p>}
      <p>{e.startsAtLabel}</p>
      {e.description && <p style={{ whiteSpace: 'pre-wrap' }}>{e.description}</p>}
      <p>
        {e.seatsLeft > 0
          ? `Осталось мест: ${e.seatsLeft}`
          : 'Мест нет, можно встать в лист ожидания'}
      </p>
    </article>
  );
}
