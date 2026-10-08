/** Mirror of the API's common error shape (see apps/api/src/errors.ts). */
export interface ApiErrorBody {
  error: { code: string; message: string; checkedInAt?: string };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly checkedInAt?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      res.status,
      body?.error.code ?? 'unknown',
      body?.error.message ?? res.statusText,
      body?.error.checkedInAt,
    );
  }
  return (await res.json()) as T;
}

export function apiGet<T>(path: string, signal?: AbortSignal, bearer?: string): Promise<T> {
  const headers: Record<string, string> = bearer ? { Authorization: `Bearer ${bearer}` } : {};
  return request<T>(path, { signal, headers });
}

export function apiPost<T>(path: string, body: unknown, bearer?: string): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}
