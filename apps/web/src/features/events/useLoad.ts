import { useEffect, useState } from 'react';
import { ApiError } from '@/shared/api/client';

export type Loaded<T> =
  | { kind: 'loading' }
  | { kind: 'ok'; data: T }
  | { kind: 'error'; status: number; message: string };

export function useLoad<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[]): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ kind: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    load(controller.signal)
      .then((data) => setState({ kind: 'ok', data }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState(
          err instanceof ApiError
            ? { kind: 'error', status: err.status, message: err.message }
            : { kind: 'error', status: 0, message: 'Сервер недоступен' },
        );
      });
    return () => controller.abort();
  }, deps);
  return state;
}
