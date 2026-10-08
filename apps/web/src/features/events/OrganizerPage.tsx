import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { fetchOrganizerEvent, rescheduleEvent } from './events.api';
import type { OrganizerEvent } from './events.types';
import { useLoad } from './useLoad';

/** The key lives in the URL fragment, so it is never sent to a server except as a Bearer header. */
function readKey(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get('key') ?? '';
}

function dateTimeInZone(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

function instantFromZoneDateTime(value: string, timeZone: string): string {
  const [date, time] = value.split('T');
  if (!date || !time) throw new Error('Укажите дату и время');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const utcGuess = Date.UTC(year!, month! - 1, day!, hour!, minute!);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(utcGuess));
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  const zonedAsUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
  );
  return new Date(utcGuess - (zonedAsUtc - utcGuess)).toISOString();
}

export function OrganizerPage() {
  const { id = '' } = useParams();
  const state = useLoad((signal) => fetchOrganizerEvent(id, readKey(), signal), [id]);
  const [stats, setStats] = useState<OrganizerEvent['stats'] | null>(null);
  const [connection, setConnection] = useState<'reconnecting' | 'live'>('reconnecting');
  const [startsAt, setStartsAt] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedStartsAt, setSavedStartsAt] = useState<string | null>(null);
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
  useEffect(() => {
    if (state.kind === 'ok') {
      setStartsAt(
        (currentValue) =>
          currentValue || dateTimeInZone(state.data.event.startsAt, state.data.event.timezone),
      );
    }
  }, [state]);
  if (state.kind === 'loading') return <p>Загрузка…</p>;
  if (state.kind === 'error') {
    return (
      <p role="alert">
        {state.status === 401 ? 'Неверная или отсутствующая ссылка организатора' : state.message}
      </p>
    );
  }
  const { event: loadedEvent } = state.data;
  const event = savedStartsAt
    ? {
        ...loadedEvent,
        startsAt: savedStartsAt,
        startsAtLabel: new Intl.DateTimeFormat('ru-RU', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: loadedEvent.timezone,
          timeZoneName: 'short',
        }).format(new Date(savedStartsAt)),
      }
    : loadedEvent;
  const current = stats ?? state.data.stats;
  async function saveReschedule() {
    if (
      !startsAt ||
      !window.confirm(
        `${current.registered + current.waitlisted} участникам уйдёт письмо. Продолжить?`,
      )
    )
      return;
    setSaving(true);
    setMessage('');
    try {
      const result = await rescheduleEvent(
        id,
        readKey(),
        instantFromZoneDateTime(startsAt, loadedEvent.timezone),
      );
      if (result.unchanged) setMessage('Дата не изменилась, письма не отправлены');
      else {
        const updated = instantFromZoneDateTime(startsAt, loadedEvent.timezone);
        setSavedStartsAt(updated);
        setMessage('Дата события обновлена. Участники получат письмо только при изменении даты.');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось перенести событие');
    } finally {
      setSaving(false);
    }
  }
  return (
    <article>
      <h1>{event.title} — организатор</h1>
      {event.hasStarted && <p role="status">Событие уже идёт</p>}
      <p>{event.startsAtLabel}</p>
      <section aria-labelledby="reschedule-heading">
        <h2 id="reschedule-heading">Перенос события</h2>
        <p>Участники получат письмо только при изменении даты.</p>
        <label>
          Новые дата и время
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </label>
        <button type="button" disabled={!startsAt || saving} onClick={() => void saveReschedule()}>
          {saving ? 'Сохраняем…' : 'Перенести'}
        </button>
        {message && <p role="status">{message}</p>}
      </section>
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
