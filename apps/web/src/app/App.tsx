import { HealthStatus } from '@/features/health';

export function App() {
  return (
    <main style={{ padding: 'var(--space-4)' }}>
      <h1>Регистрация на мероприятия</h1>
      <HealthStatus />
    </main>
  );
}
