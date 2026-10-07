---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "apps/api/test/**"
  - "e2e/**"
---

# Тесты

- Без `.skip`, `.only`, `skipIf`, `runIf`, условных `return` «если нет БД»: без Postgres тесты обязаны падать.
- Postgres не мокать; мок допустим только для SMTP-транспорта.
- Не ослаблять и не удалять тест, чтобы он прошёл — объяснить и спросить.
- Проверяется: ESLint (`vitest/no-disabled-tests`, `vitest/no-focused-tests`) и `scripts/check-invariants.sh` (п. 1). Моки Postgres и ослабление тестов механикой не ловятся — ревью.
