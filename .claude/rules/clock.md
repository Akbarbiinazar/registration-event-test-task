---
paths:
  - "apps/api/src/domain/**"
  - "apps/api/src/jobs/**"
---

# Время только через Clock

- Только `clock.now()`; время передаётся в SQL параметром.
- Нельзя: `Date.now()`, `new Date()` без аргументов, SQL `now()`.
- Проверяется: ESLint (`no-restricted-syntax`) и `scripts/check-invariants.sh` (п. 2).
