import { Link, useParams } from 'react-router';
import { fetchTicket } from './events.api';
import { useLoad } from './useLoad';

export function TicketPage() {
  const { token = '' } = useParams();
  const state = useLoad((signal) => fetchTicket(token, signal), [token]);
  if (state.kind === 'loading') return <p>Загрузка билета…</p>;
  if (state.kind === 'error') {
    return <p role="alert">{state.status === 404 ? 'Билет не найден' : state.message}</p>;
  }
  const ticket = state.data;
  return (
    <article>
      <h1>Билет на «{ticket.event.title}»</h1>
      <p>{ticket.event.startsAtLabel}</p>
      {ticket.status === 'confirmed' && ticket.code ? (
        <p style={{ fontSize: '2.5rem', fontWeight: 'bold', letterSpacing: '0.1em' }}>
          {ticket.code}
        </p>
      ) : (
        <p role="status">
          {ticket.status === 'waitlisted' ? 'Вы в листе ожидания' : 'Регистрация отменена'}
        </p>
      )}
      <Link to={`/e/${ticket.event.id}`}>К событию</Link>
    </article>
  );
}
