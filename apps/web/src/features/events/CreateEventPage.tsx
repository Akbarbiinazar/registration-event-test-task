import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiError } from '@/shared/api/client';
import { Field } from '@/shared/ui/Field';
import { createEvent } from './events.api';
import './create-event.css';

type FieldName = 'title' | 'description' | 'startsAt' | 'capacity';
type FormErrors = Partial<Record<FieldName, string>>;
const fields: { name: FieldName; label: string }[] = [
  { name: 'title', label: 'Название' },
  { name: 'description', label: 'Описание' },
  { name: 'startsAt', label: 'Начало' },
  { name: 'capacity', label: 'Количество мест' },
];

function fieldFor(message: string): FieldName | null {
  if (/Название/.test(message)) return 'title';
  if (/Описание/.test(message)) return 'description';
  if (/дат|врем|начала/i.test(message)) return 'startsAt';
  if (/Количество мест/.test(message)) return 'capacity';
  return null;
}

export function CreateEventPage() {
  const navigate = useNavigate();
  const [errors, setErrors] = useState<FormErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const local = String(form.get('startsAt') ?? '');
    const startsAt = new Date(local); // datetime-local is parsed in the browser's zone
    setErrors({});
    setGeneralError(null);
    if (Number.isNaN(startsAt.getTime())) {
      setErrors({ startsAt: 'Укажите дату и время начала' });
      return;
    }
    setBusy(true);
    try {
      const created = await createEvent({
        title: String(form.get('title') ?? ''),
        description: String(form.get('description') ?? ''),
        startsAt: startsAt.toISOString(),
        timezone,
        capacity: Number(form.get('capacity')),
      });
      void navigate(`/events/${created.event.id}/created`, { state: created });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Сервер недоступен';
      const field = err instanceof ApiError ? fieldFor(message) : null;
      if (field) setErrors({ [field]: message });
      else setGeneralError(message);
    } finally {
      setBusy(false);
    }
  }

  const errorEntries = fields.filter(({ name }) => errors[name]);
  return (
    <section className="create-event-page">
      <Link className="back-link" to="/">
        ← Все события
      </Link>
      <header className="create-event-header">
        <p className="event-list-eyebrow">Для организатора</p>
        <h1>Новое событие</h1>
        <p>Расскажите о встрече и укажите, когда она начнётся.</p>
      </header>
      <form noValidate onSubmit={(e) => void onSubmit(e)}>
        {(errorEntries.length > 0 || generalError) && (
          <div className="form-error-summary" role="alert" aria-labelledby="form-error-title">
            <h2 id="form-error-title">Проверьте форму</h2>
            {generalError && <p>{generalError}</p>}
            {errorEntries.length > 0 && (
              <ul>
                {errorEntries.map(({ name, label }) => (
                  <li key={name}>
                    <a href={`#create-${name}`}>
                      {label}: {errors[name]}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <Field id="create-title" label="Название" error={errors.title} required>
          <input name="title" type="text" maxLength={200} />
        </Field>
        <Field id="create-description" label="Описание" error={errors.description}>
          <textarea name="description" rows={4} maxLength={10000} />
        </Field>
        <Field
          id="create-startsAt"
          label="Начало (в вашем часовом поясе)"
          error={errors.startsAt}
          required
        >
          <input name="startsAt" type="datetime-local" />
        </Field>
        <p className="timezone-hint">
          Часовой пояс события: {timezone}. Время будет показано участникам в этом поясе.
        </p>
        <Field id="create-capacity" label="Количество мест" error={errors.capacity} required>
          <input name="capacity" type="number" min={1} max={10000} defaultValue={10} />
        </Field>
        <div className="create-actions">
          <button className="primary-action" type="submit" disabled={busy}>
            {busy ? 'Создаём…' : 'Создать'}
          </button>
          <Link className="secondary-action" to="/">
            Отмена
          </Link>
        </div>
      </form>
    </section>
  );
}
