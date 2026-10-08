import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '@/shared/api/client';
import { EventDateTime } from '@/shared/ui/EventDateTime';
import { Field } from '@/shared/ui/Field';
import { fetchEvent, registerForEvent } from './events.api';
import type { RegistrationResult } from './events.types';
import { useLoad } from './useLoad';
import './event-detail.css';

export function PublicEventPage() {
  const { id = '' } = useParams();
  const [retry, setRetry] = useState(0);
  const state = useLoad((signal) => fetchEvent(id, signal), [id, retry]);
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const [fieldError, setFieldError] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldError('');
    setGeneralError('');
    setResult(null);
    setPending(true);
    try {
      setResult(await registerForEvent(id, email));
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === 'validation_error') {
        setFieldError(failure.message);
      } else {
        setGeneralError(
          failure instanceof Error ? failure.message : 'Не удалось зарегистрироваться',
        );
      }
    } finally {
      setPending(false);
    }
  }

  if (state.kind === 'loading')
    return (
      <section className="event-detail-page" role="status" aria-label="Загрузка события">
        <span className="visually-hidden">Загрузка события…</span>
        <div className="detail-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      </section>
    );
  if (state.kind === 'error')
    return (
      <section className="event-detail-page">
        <Link className="back-link" to="/">
          ← Все события
        </Link>
        <div className="detail-state" role={state.status === 404 ? undefined : 'alert'}>
          <h1>{state.status === 404 ? 'Событие не найдено' : 'Событие не загрузилось'}</h1>
          {state.status !== 404 && (
            <>
              <p>{state.message}</p>
              <button
                type="button"
                className="secondary-action"
                onClick={() => setRetry((value) => value + 1)}
              >
                Повторить загрузку
              </button>
            </>
          )}
        </div>
      </section>
    );
  const e = state.data;
  const seatsText =
    e.seatsLeft === 0
      ? 'Мест нет'
      : e.seatsLeft <= 3
        ? `Мало мест · осталось ${e.seatsLeft}`
        : `Осталось ${e.seatsLeft} мест`;
  return (
    <article className="event-detail-page">
      <Link className="back-link" to="/">
        ← Все события
      </Link>
      <header className="detail-header">
        <div>
          <p className="event-list-eyebrow">Событие</p>
          <h1>{e.title}</h1>
          {e.hasStarted && <p role="status">Событие уже идёт</p>}
        </div>
        <div className="detail-datetime">
          <EventDateTime
            startsAt={e.startsAt}
            startsAtLabel={e.startsAtLabel}
            timezone={e.timezone}
          />
        </div>
      </header>
      <div className="detail-content">
        <div>
          {e.description && <p className="detail-description">{e.description}</p>}
          <p className="seats-chip">{seatsText}</p>
          {e.seatsLeft > 0 && <p className="seat-legacy">Осталось мест: {e.seatsLeft}</p>}
        </div>
        <section className="registration-panel" aria-labelledby="registration-title">
          <h2 id="registration-title">{e.seatsLeft === 0 ? 'Лист ожидания' : 'Регистрация'}</h2>
          <p>
            {e.seatsLeft === 0
              ? 'Оставьте email, чтобы встать в лист ожидания.'
              : 'Оставьте email, чтобы получить билет.'}
          </p>
          <form id="registration-form" onSubmit={(event) => void submit(event)} noValidate>
            <Field
              id="registration-email"
              label="Ваш email"
              hint="Билет или уведомление придёт на эту почту."
              error={fieldError}
              required
            >
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={pending}
              />
            </Field>
            <button className="primary-action" type="submit" disabled={pending}>
              {pending
                ? 'Отправляем…'
                : e.seatsLeft === 0
                  ? 'Встать в лист ожидания'
                  : 'Зарегистрироваться'}
            </button>
          </form>
          {generalError && (
            <div className="registration-error" role="alert">
              <p>{generalError}</p>
              <button
                type="submit"
                form="registration-form"
                className="secondary-action"
                disabled={pending}
              >
                Повторить
              </button>
            </div>
          )}
          {result && (
            <p className="registration-success" role="status" aria-live="polite">
              {result.alreadyRegistered
                ? 'Вы уже зарегистрированы'
                : result.status === 'confirmed'
                  ? 'Место ваше, билет на почте'
                  : 'Вы в листе ожидания'}
            </p>
          )}
        </section>
      </div>
    </article>
  );
}
