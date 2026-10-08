# 08. Напоминание за сутки

**Цель:** за 24 часа до события каждый подтверждённый участник получает ровно
одно напоминание.

**Зависит от:** 03  **Оценка:** 1 ч  **Доказывает:** P4

## Объём
- `jobs/reminders.ts` — `runReminderTick(deps)`: один запрос
  `INSERT INTO outbox_emails … SELECT … FROM registrations JOIN events
  WHERE status = 'confirmed' AND starts_at > $now AND starts_at <= $now + interval '24 hours'
  ON CONFLICT (dedup_key) DO NOTHING`; ключ
  `reminder:{registration_id}:{schedule_version}`, в строку outbox пишется
  `schedule_version`. Окно — `starts_at − 24 ч ≤ now < starts_at`, без
  условия на `confirmed_at` (D6). Время в письме — в поясе события (A13).
  Тело письма рендерится в
  приложении → запрос строит данные, вставка пачкой (или рендер в SQL-шаблоне —
  решить в plan mode, записать в DEVLOG).
- Мейлер (I11, D4): забирая напоминание `FOR UPDATE SKIP LOCKED`, сверяет
  `outbox.schedule_version = events.schedule_version` и
  `registrations.status = 'confirmed'`; иначе ставит `skipped_at`, письмо не
  отправляет.
- Запуск по `setInterval(REMINDER_TICK_MS)` в `main.ts`; первый тик — при старте.
- Для демо: `REMINDER_TICK_MS` в `.env.example` = 10 000.

## Не входит
Настраиваемое окно напоминания.

## Критерии приёмки
- [x] Событие через 2 ч, участник подтверждён → в течение тика письмо
      «Напоминание» в Mailpit; перезапуск API не порождает второго.
- [x] P4 зелёный.

## Тесты
- **P4** (`proofs/p4-reminder.proof.test.ts`) — `FakeClock`, тики
  последовательные и параллельные;
- повышенный из листа или зарегистрированный внутри окна получает одно
  напоминание;
- устаревшее напоминание (отказ или перенос между постановкой и отправкой) →
  `skipped_at`, транспорт не вызван;
- после переноса (`schedule_version` 2) — одно напоминание для новой даты
  (если 09 ещё не сделан — версия выставляется в тесте напрямую).
