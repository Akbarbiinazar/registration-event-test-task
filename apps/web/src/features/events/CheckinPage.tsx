import { useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '@/shared/api/client';
import { checkInTicket, fetchOrganizerEvent } from './events.api';
import { useLoad } from './useLoad';

interface Entry {
  code: string;
  time: string;
}
type Result = { kind: 'success' | 'repeat' | 'error'; message: string };

function readKey(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get('key') ?? '';
}

function timeInZone(iso: string, zone: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

export function CheckinPage() {
  const { id = '' } = useParams();
  const state = useLoad((signal) => fetchOrganizerEvent(id, readKey(), signal), [id]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [recent, setRecent] = useState<Entry[]>([]);
  const input = useRef<HTMLInputElement>(null);

  if (state.kind === 'loading') return <p>Загрузка…</p>;
  if (state.kind === 'error')
    return (
      <p role="alert">
        {state.status === 401 ? 'Неверная или отсутствующая ссылка организатора' : state.message}
      </p>
    );

  const { event } = state.data;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !code.trim()) return;
    const submitted = code.trim();
    setBusy(true);
    setCode('');
    try {
      const checked = await checkInTicket(id, readKey(), submitted);
      const time = timeInZone(checked.checkedInAt, event.timezone);
      setResult({ kind: 'success', message: `Пропущен ✓ — ${time}` });
      setRecent((entries) => [{ code: submitted.toUpperCase(), time }, ...entries].slice(0, 5));
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === 'already_checked_in' && error.checkedInAt) {
          setResult({
            kind: 'repeat',
            message: `Уже прошёл в ${timeInZone(error.checkedInAt, event.timezone)}`,
          });
        } else if (error.code === 'ticket_not_found') {
          setResult({ kind: 'error', message: 'Билет не найден' });
        } else if (error.code === 'ticket_not_active') {
          setResult({ kind: 'error', message: 'Билет не активен (лист ожидания / отказ)' });
        } else {
          setResult({ kind: 'error', message: error.message });
        }
      } else {
        setResult({ kind: 'error', message: 'Не удалось проверить билет' });
      }
    } finally {
      setBusy(false);
      input.current?.focus();
    }
  }

  const colors = { success: '#166534', repeat: '#92400e', error: '#b91c1c' };
  return (
    <article style={{ maxWidth: 680, margin: '0 auto' }}>
      <p>
        <Link to={`/o/${id}${window.location.hash}`}>← К странице организатора</Link>
      </p>
      <h1>Чекин — {event.title}</h1>
      <p>{event.startsAtLabel}</p>
      <form
        onSubmit={(e) => {
          void submit(e);
        }}
      >
        <label htmlFor="ticket-code">Код билета</label>
        <input
          id="ticket-code"
          ref={input}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="XXXX-XXXX"
          disabled={busy}
          style={{
            display: 'block',
            width: '100%',
            boxSizing: 'border-box',
            fontSize: '2rem',
            padding: '16px',
            margin: '12px 0',
          }}
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          style={{ fontSize: '1.2rem', padding: '12px 24px' }}
        >
          Проверить
        </button>
      </form>
      {result && (
        <div
          role="status"
          style={{
            marginTop: 24,
            padding: 20,
            borderRadius: 8,
            color: 'white',
            background: colors[result.kind],
            fontSize: '1.5rem',
            fontWeight: 700,
          }}
        >
          {result.message}
        </div>
      )}
      <h2>Последние чекины</h2>
      {recent.length === 0 ? (
        <p>Пока нет чекинов в этой вкладке</p>
      ) : (
        <ol>
          {recent.map((entry, index) => (
            <li key={`${entry.code}-${index}`}>
              {entry.code} — {entry.time}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
