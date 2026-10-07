# 01. Ходячий скелет

**Цель:** пустой, но сквозной продукт — браузер → web → api → Postgres — и
тестовый стенд, на котором дальше строятся доказательства.

**Зависит от:** —  **Оценка:** 1.5 ч

## Объём
- npm workspaces: `apps/api` (Fastify + TS), `apps/web` (React + Vite + TS).
- `docker-compose.yml`: `postgres:16` (хост-порт 5433), `axllent/mailpit`
  (1025, 8025). Скрипт инициализации создаёт базы `events` и `events_test`.
- Раннер миграций (`schema_migrations`), первая миграция — пустая схема
  или `pgcrypto`.
- `Clock`, `SystemClock`, `FakeClock`.
- `GET /api/health` → `{ ok: true, db: true }` (делает `SELECT 1`).
- Web: страница-заглушка показывает статус `/api/health` через Vite-прокси.
- Конфиг через env с валидацией при старте; `.env.example`.
- ESLint (+ `eslint-plugin-vitest`: `no-disabled-tests`, `no-focused-tests`;
  `no-restricted-syntax` на `Date.now()`/`new Date()` в `domain/` и `jobs/`),
  Prettier, `tsc --noEmit`.
- Vitest: `globalSetup` с миграциями и **падением при недоступной БД**,
  `TRUNCATE` перед каждым тестом, `fileParallelism: false`.
- Корневые скрипты из `CLAUDE.md`, включая `check`.
- GitHub Actions: lint, typecheck, test (service postgres), build.
- `docs/DEVLOG.md` — шапка уже есть, дописать запись.

## Не входит
Доменные таблицы (появляются в своих слайсах).

## Критерии приёмки
- [ ] `npm run db:up && npm run migrate && npm run dev` → на :5173 видно
      «API: ok, DB: ok».
- [ ] `npm test` с поднятой БД — зелёный; с `docker compose stop postgres` —
      **красный** с понятным сообщением (вывод приложить в DEVLOG).
- [ ] Тест, в котором стоит `it.skip`, ломает `npm run lint`.
- [ ] `npm run check` зелёный.

## Тесты
- `health.test.ts`: `GET /api/health` через `app.inject()` → 200, `db: true`.
- `clock.test.ts`: `FakeClock.set/advance`.

## Если не хватает времени
GitHub Actions переносится в 11 (очередь отсечения 5).
