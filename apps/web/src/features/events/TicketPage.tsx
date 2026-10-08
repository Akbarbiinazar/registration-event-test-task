import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { cancelTicket, fetchTicket } from './events.api';
import { useLoad } from './useLoad';

export function TicketPage() {
  const { token = '' } = useParams();
  const state = useLoad((signal) => fetchTicket(token, signal), [token]);
  const [cancelled, setCancelled] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function cancel() {
    if (!window.confirm('Отказаться от участия в событии?')) return;
    setPending(true);
    setError('');
    try {
      await cancelTicket(token);
      setCancelled(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось отказаться');
    } finally {
      setPending(false);
    }
  }
  if (state.kind === 'loading') return <p>Загрузка билета…</p>;
  if (state.kind === 'error') {
    return <p role="alert">{state.status === 404 ? 'Билет не найден' : state.message}</p>;
  }
  const ticket = state.data;
  return (
    <article>
      <h1>Билет на «{ticket.event.title}»</h1>
      <p>{ticket.event.startsAtLabel}</p>
      {!cancelled && ticket.status === 'confirmed' && ticket.code ? (
        <p style={{ fontSize: '2.5rem', fontWeight: 'bold', letterSpacing: '0.1em' }}>
          {ticket.code}
        </p>
      ) : (
        <p role="status">
          {!cancelled && ticket.status === 'waitlisted'
            ? `Вы ${ticket.position}-й в листе ожидания`
            : 'Участие отменено'}
        </p>
      )}
      {!cancelled && ticket.status !== 'cancelled' && (
        <p>
          <button type="button" disabled={pending} onClick={() => void cancel()}>
            {pending ? 'Отмена…' : 'Отказаться'}
          </button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <Link to={`/e/${ticket.event.id}`}>К событию</Link>
    </article>
  );
}
