# 03. Регистрация и письмо с билетом

**Цель:** участник регистрируется по email и получает письмо с билетом в
Mailpit; повторная регистрация не создаёт второго места.

**Зависит от:** 02  **Оценка:** 2 ч  **Доказывает:** P1

## Объём
- Миграции `registrations`, `outbox_emails` (§4, все CHECK и частичный
  UNIQUE). `outbox_emails` создаётся сразу полной: все `kind`, включая
  `cancelled`, колонки `schedule_version` и `skipped_at` — применённые
  миграции не редактируются.
- Домен `register(deps, { eventId, email })`, одна транзакция:
  1. нормализация email; `SELECT … FROM events WHERE id = $1 FOR UPDATE`
     (D1: сериализация с отказом и переносом; нет события → `404`).
     Регистрация после начала события разрешена (A11);
  2. `INSERT … status='waitlisted' ON CONFLICT (event_id, email) WHERE status <> 'cancelled' DO NOTHING RETURNING`;
     нет строки → вернуть существующую регистрацию (`alreadyRegistered: true`);
  3. условный `UPDATE events … WHERE seats_taken < capacity RETURNING` →
     есть строка → `status='confirmed'`, `confirmed_at`;
  4. outbox: `ticket:{id}` для подтверждённого (письмо `waitlisted` — в 04);
  5. `pg_notify('event_stats', event_id)`.
- Генерация `ticket_code` (8 симв. Crockford Base32, `crypto.randomInt`) и
  `manage_token` (32 байта, base64url). Коллизия кода → повтор вставки.
- Шаблоны писем (plain text, рус.): тема, дата через `formatInZone` в поясе
  события (A13), код в виде `XXXX-XXXX` (A10), ссылка
  `WEB_BASE_URL/t/:manageToken`.
- Отправщик `runMailerTick(deps, transport)`: пачка `FOR UPDATE SKIP LOCKED`
  где `sent_at IS NULL AND next_attempt_at <= $now`; успех → `sent_at`;
  ошибка → `attempts+1`, `last_error`, `next_attempt_at` с экспоненциальным
  backoff. `Message-ID: <{dedup_key}@events.local>`. Интервал в `main.ts`.
- `POST /api/events/:id/registrations` → `{ status, alreadyRegistered }`
  (без кода билета — A3).
- `GET /api/tickets/:manageToken` → событие, статус, код (если `confirmed`).
- UI: форма на `/e/:id`, ответ «Место ваше, билет на почте» / «Вы уже
  зарегистрированы»; `/t/:token` — страница билета (код крупно).
- `scripts/smoke.sh`: регистрация через API → письмо найдено через API Mailpit.

## Не входит
Отказ, лист ожидания в UI, повышение (04).

## Критерии приёмки
- [x] Регистрация в UI → письмо в Mailpit (http://localhost:8025) → по ссылке
      открывается билет с кодом.
- [x] Повторная регистрация того же email в другом регистре → «Вы уже
      зарегистрированы», второго письма нет.
- [x] P1 зелёный; `assertInvariants` зелёный.

## Тесты
- **P1** (`proofs/p1-registration.proof.test.ts`) — см. `PROOF_PLAN.md`;
- `INSERT` дубля в обход кода → `unique_violation`; email в верхнем регистре → `check_violation`;
- регистрация после начала события → 201, как обычно (A11);
- ответ регистрации не содержит кода билета (A3);
- `mailer.test.ts`: успех, ошибка с backoff, `Message-ID`, `SKIP LOCKED`
  (два параллельных тика не шлют одно письмо дважды).

## Если не хватает времени
Ретраи/backoff → одна попытка (очередь отсечения 3).
