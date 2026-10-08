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

# 5. every bare import is declared in the workspace (or root) package.json
hits=""
for ws in apps/*/; do
  [ -f "${ws}package.json" ] || continue
  # shellcheck disable=SC2016
  out=$(node -e '
    const fs = require("fs"), path = require("path");
    const [ws] = process.argv.slice(1);
    const declared = new Set();
    for (const f of [ws + "package.json", "package.json"]) {
      const j = JSON.parse(fs.readFileSync(f, "utf8"));
      for (const k of ["dependencies", "devDependencies"]) Object.keys(j[k] ?? {}).forEach((d) => declared.add(d));
    }
    const missing = new Set();
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) { if (!["node_modules", "dist"].includes(e.name)) walk(p); continue; }
        if (!/\.(ts|tsx)$/.test(e.name)) continue;
        const src = fs.readFileSync(p, "utf8");
        for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["\x27]([^"\x27]+)["\x27]/g)) {
          const spec = m[1];
          if (/^(\.|@\/|node:)/.test(spec)) continue;
          const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
          if (!declared.has(name)) missing.add(ws + ": " + name + " (" + p + ")");
        }
      }
    };
    for (const d of ["src", "test"]) if (fs.existsSync(ws + d)) walk(ws + d);
    console.log([...missing].join("\n"));
  ' "$ws")
  [ -n "$out" ] && hits="${hits}${out}"$'\n'
done
report "imports are declared in package.json" "${hits%$'\n'}"

exit $fail
