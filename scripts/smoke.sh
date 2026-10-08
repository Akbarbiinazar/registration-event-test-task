#!/usr/bin/env bash
set -euo pipefail

# Run with Postgres, Mailpit, API, and web already started (npm run db:up && npm run dev).
email="smoke-$(node -e 'console.log(require("node:crypto").randomUUID())')@example.com"
event_json=$(curl -fsS -X POST http://127.0.0.1:3000/api/events \
  -H 'Content-Type: application/json' \
  -d '{"title":"Smoke ticket","startsAt":"2030-05-10T15:00:00Z","timezone":"Europe/Moscow","capacity":1}')
event_id=$(printf '%s' "$event_json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["event"]["id"])')
curl -fsS -X POST "http://127.0.0.1:3000/api/events/$event_id/registrations" \
  -H 'Content-Type: application/json' -d "{\"email\":\"$email\"}" >/dev/null

for attempt in $(seq 1 20); do
  messages=$(curl -fsS http://127.0.0.1:8025/api/v1/messages)
  found=$(printf '%s' "$messages" | python3 -c 'import json,sys; email=sys.argv[1]; print(sum(any(r["Address"] == email for r in m["To"]) for m in json.load(sys.stdin)["messages"]))' "$email")
  if [ "$found" = 1 ]; then
    echo "OK: ticket email for $email found in Mailpit"
    exit 0
  fi
  sleep 1
done

echo "Ticket email for $email did not arrive in Mailpit" >&2
exit 1
