import { useEffect, useState } from 'react';
import { ApiError } from '@/shared/api/client';
import { fetchHealth } from './health.api';

type State = { kind: 'loading' } | { kind: 'ok' } | { kind: 'error'; message: string };

export function HealthStatus() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then(() => setState({ kind: 'ok' }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const message = err instanceof ApiError ? err.code : 'api_unreachable';
        setState({ kind: 'error', message });
      });
    return () => controller.abort();
  }, []);

  if (state.kind === 'loading') return <p>Проверяем сервер…</p>;
  if (state.kind === 'error') {
    return (
      <p role="status" style={{ color: 'var(--color-error)' }}>
        Ошибка: {state.message}
      </p>
    );
  }
  return (
    <p role="status" style={{ color: 'var(--color-ok)' }}>
      API: ok, DB: ok
    </p>
  );
}
