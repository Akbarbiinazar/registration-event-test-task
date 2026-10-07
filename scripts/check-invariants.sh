#!/usr/bin/env bash
# Mechanical checks for CLAUDE.md prohibitions that ESLint cannot see.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

fail=0
report() { # name, matches
  if [ -n "$2" ]; then
    echo "FAIL  $1"; echo "$2" | sed 's/^/        /'; fail=1
  else
    echo "OK    $1"
  fi
}
existing() { for d in "$@"; do [ -e "$d" ] && echo "$d"; done; }

# 1. disabled/conditional tests
test_dirs=$(existing apps e2e)
hits=""
if [ -n "$test_dirs" ]; then
  # shellcheck disable=SC2086
  hits=$(grep -rEn --include='*.test.ts' --include='*.test.tsx' --include='*.spec.ts' \
    --exclude-dir=node_modules --exclude-dir=dist \
    '\.skip|\.only|skipIf|runIf|\bxit\(|\bxdescribe\(|\bxtest\(' $test_dirs || true)
fi
report "no skip/only/skipIf/runIf in tests" "$hits"

# 2. SQL now() in domain and jobs
src_dirs=$(existing apps/api/src/domain apps/api/src/jobs)
hits=""
if [ -n "$src_dirs" ]; then
  # shellcheck disable=SC2086
  hits=$(grep -rEniI '\bnow\(\)' $src_dirs | grep -Ev 'clock\.now\(\)' || true)
fi
report "no now() in domain/jobs (time comes from clock)" "$hits"

# 3. applied migrations are immutable (only A allowed)
mig=apps/api/migrations
hits=""
if [ -d "$mig" ]; then
  if ! git rev-parse --verify -q main >/dev/null; then
    hits="branch 'main' not found, cannot compare migrations"
  else
    hits=$( { git diff --name-status main -- "$mig"; git diff --name-status -- "$mig"; } | grep -Ev '^A' || true)
  fi
fi
report "migrations: no M/D/R against main" "$hits"

# 4. env files
hits=$(git ls-files '.env*' '**/.env*' | grep -Ev '(^|/)\.env\.example$' || true)
report ".env* not tracked (except .env.example)" "$hits"

exit $fail
