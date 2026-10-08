import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '@/shared/api/client';
import { createEvent } from './events.api';

export function CreateEventPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const local = String(form.get('startsAt') ?? '');
    const startsAt = new Date(local); // datetime-local is parsed in the browser's zone
    setError(null);
    if (Number.isNaN(startsAt.getTime())) {
      setError('Укажите дату и время начала');
      return;
    }
    setBusy(true);
    try {
      const created = await createEvent({
        title: String(form.get('title') ?? ''),
        description: String(form.get('description') ?? ''),
        startsAt: startsAt.toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        capacity: Number(form.get('capacity')),
      });
      void navigate(`/events/${created.event.id}/created`, { state: created });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Сервер недоступен');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h1>Новое событие</h1>
      <form
        noValidate
        onSubmit={(e) => void onSubmit(e)}
        style={{ display: 'grid', gap: 'var(--space-3)', maxWidth: 420 }}
      >
        <label>
          Название
          <input name="title" type="text" style={{ display: 'block', width: '100%' }} />
        </label>
        <label>
          Описание
          <textarea name="description" rows={4} style={{ display: 'block', width: '100%' }} />
        </label>
        <label>
          Начало (в вашем часовом поясе)
          <input name="startsAt" type="datetime-local" style={{ display: 'block' }} />
        </label>
        <label>
          Количество мест
          <input
            name="capacity"
            type="number"
            min={1}
            max={10000}
            defaultValue={10}
            style={{ display: 'block' }}
          />
        </label>
        {error && (
          <p role="alert" style={{ color: 'var(--color-error)' }}>
            {error}
          </p>
        )}
        <button type="submit" disabled={busy}>
          Создать
        </button>
      </form>
      <p>
        <Link to="/">← К списку</Link>
      </p>
    </section>
  );
}
