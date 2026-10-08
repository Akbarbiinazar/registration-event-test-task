import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { fetchEvent, registerForEvent } from './events.api';
import type { RegistrationResult } from './events.types';
import { useLoad } from './useLoad';

export function PublicEventPage() {
  const { id = '' } = useParams();
  const state = useLoad((signal) => fetchEvent(id, signal), [id]);
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    setResult(null);
    try {
      setResult(await registerForEvent(id, email));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось зарегистрироваться');
    } finally {
      setPending(false);
    }
  }
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
      <form onSubmit={(event) => void submit(event)} noValidate>
        <label htmlFor="registration-email">Ваш email</label>{' '}
        <input
          id="registration-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={pending}
        />{' '}
        <button type="submit" disabled={pending}>
          {pending ? 'Регистрация…' : 'Зарегистрироваться'}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {result && (
        <p role="status">
          {result.alreadyRegistered
            ? 'Вы уже зарегистрированы'
            : result.status === 'confirmed'
              ? 'Место ваше, билет на почте'
              : 'Вы в листе ожидания'}
        </p>
      )}
    </article>
  );
}
