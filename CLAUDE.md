# CLAUDE.md

Сервис регистрации на мероприятия (тестовое задание). Источники истины:

- `docs/ASSIGNMENT.md` — исходное ТЗ, **не редактировать**;
- `project_spec.md` — поведение, модель данных, инварианты, допущения;
- `docs/PROOF_PLAN.md` — какой тест доказывает какое поведение;
- `docs/issues/NN-*.md` — слайсы, порядок работ и порядок отсечения;
- `docs/DEVLOG.md` — журнал работы с временными метками.

Если код расходится со спецификацией — остановиться и спросить, а не
«подправить» спецификацию молча.

## Язык

- Документы (`*.md`, кроме кода в них) — на русском.
- Код, идентификаторы, комментарии в коде, сообщения коммитов, имена веток —
  на английском.
- Тексты интерфейса и писем — на русском.

## Нестандартное в стеке

Без ORM: сырой SQL через `pg`. Postgres 16 и Mailpit — в docker compose, Postgres на хосте — порт `5433`.

## Команды

Все команды — из корня репозитория.

| Задача | Команда |
|---|---|
| Поднять Postgres и Mailpit | `npm run db:up` |
| Применить миграции (dev и test базы) | `npm run migrate` |
| Dev-режим (api :3000 + web :5173) | `npm run dev` |
| Lint | `npm run lint` |
| Проверка типов | `npm run typecheck` |
| Тесты (нужна Postgres) | `npm test` |
| Только тесты-доказательства | `npm run test:proofs` |
| E2E (Playwright) | `npm run test:e2e` |
| Сборка | `npm run build` |
| Механические проверки запретов | `npm run check:invariants` |
| Всё перед коммитом | `npm run check` (= lint + check:invariants + typecheck + test + build) |

Mailpit UI: http://localhost:8025. Postgres на хосте: порт `5433`.
`.env` необязателен: значения по умолчанию лежат в `apps/api/src/config.ts`, примеры — в `.env.example`.

## Рабочий процесс

1. **Один слайс за сессию.** Взять следующий по порядку файл из
   `docs/issues/`, не начинать следующий без подтверждения пользователя.
2. **Plan mode в начале слайса.** Прочитать issue, относящиеся разделы
   спецификации и плана доказательств; предложить план (файлы, миграции,
   тесты); дождаться одобрения и только потом писать код.
3. **Сначала тест.** Для поведения из ТЗ сначала пишется тест-доказательство из
   `docs/PROOF_PLAN.md`, убеждаемся, что он падает по правильной причине, затем
   реализация.
4. **Готово** — все критерии приёмки issue выполнены и `npm run check`
   зелёный. Результат проверки показать пользователю (вывод, а не пересказ).
5. **DEVLOG.** После слайса дописать запись в `docs/DEVLOG.md`. Время брать
   командой `date '+%Y-%m-%d %H:%M %z'`, не придумывать. Формат записи —
   в шапке DEVLOG.
6. **Коммит на каждый слайс.** Минимум один коммит на слайс (можно больше —
   промежуточные зелёные шаги). Conventional Commits со scope слайса:
   `feat(s03): register participant and enqueue ticket email`. DEVLOG
   коммитится вместе со слайсом.
7. **История не переписывается:** без squash, без `rebase -i`, без
   `commit --amend` уже показанных коммитов, без `push --force`.
8. **Правила после слайса.** После слайса предложить пользователю 1–3
   правила или проверки (ESLint, `scripts/check-invariants.sh`,
   `.claude/rules/`), закрывающие ошибки, найденные в слайсе; добавлять только
   после одобрения.

## Запреты

- Тесты: без skip/only и моков Postgres — `.claude/rules/tests.md`
  (проверка: ESLint + `scripts/check-invariants.sh`).
- Время в `domain` и `jobs` — только `clock.now()` — `.claude/rules/clock.md`
  (проверка: ESLint + `scripts/check-invariants.sh`).
- Не переносить в код инварианты, которые держит БД (см. `project_spec.md` §5):
  никаких «SELECT count, потом INSERT» вместо условного `UPDATE`/`ON CONFLICT`.
- Каждое изменение состояния + постановка письма в outbox + `pg_notify` —
  в одной транзакции.
- Не подключать ORM и query builder. Новая зависимость — только с причиной,
  записанной в DEVLOG.
- Применённые миграции не редактируются — `.claude/rules/migrations.md`
  (проверка: `scripts/check-invariants.sh`).
- Не использовать `any` и `@ts-ignore`; `eslint-disable` — только построчно и
  с комментарием-причиной.
- `npm install` — только из корня и с `-w` — `.claude/rules/npm.md`
  (проверка: `scripts/check-invariants.sh`).
- Не коммитить `.env`, секреты, `node_modules`, артефакты сборки.
- Не редактировать `docs/ASSIGNMENT.md`.
- Не выходить за рамки текущего слайса: заметки «на потом» — в раздел
  «Следующим заходом» в DEVLOG, а не в код.

# Rules
@project_spec.md
- One vertical slice at a time (DB + API + UI + test). Stop after each for review.
- Follow the folder layout and layering exactly: controller -> service -> repository; web features import only shared/ or themselves.
- Define the contract (packages/contracts) before implementing either side.
- Validate all input at the API boundary. Return the common error shape.
- Never invent requirements. If acceptance criteria are missing in project_spec, ask.
- Each slice has a row in PROOF_PLAN (criterion, how proven, result). Fill it only with results you actually ran; never mark a criterion proven without evidence.
- After each slice add an entry to DEVLOG: prompt, what you got wrong, what I changed by hand, decisions, how verified, commit hash.
- Run lint, typecheck, and tests before reporting done; show the output.
- If you make a decision project_spec does not cover, say so and ask.
