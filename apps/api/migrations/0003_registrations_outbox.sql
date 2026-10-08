CREATE TABLE registrations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       uuid NOT NULL REFERENCES events(id),
  email          text NOT NULL CHECK (email = lower(btrim(email))),
  status         text NOT NULL CHECK (status IN ('confirmed', 'waitlisted', 'cancelled')),
  queue_seq      bigint GENERATED ALWAYS AS IDENTITY,
  ticket_code    text NOT NULL UNIQUE CHECK (ticket_code ~ '^[0-9A-HJKMNP-TV-Z]{8}$'),
  manage_token   text NOT NULL UNIQUE,
  created_at     timestamptz NOT NULL,
  confirmed_at   timestamptz,
  cancelled_at   timestamptz,
  checked_in_at  timestamptz,
  CONSTRAINT cancellation_matches_status CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  CONSTRAINT checked_in_requires_confirmation CHECK (checked_in_at IS NULL OR status = 'confirmed')
);

CREATE UNIQUE INDEX one_active_per_email ON registrations (event_id, email)
  WHERE status <> 'cancelled';
CREATE INDEX waitlist_order ON registrations (event_id, queue_seq)
  WHERE status = 'waitlisted';

CREATE TABLE outbox_emails (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dedup_key        text NOT NULL UNIQUE,
  kind             text NOT NULL CHECK (kind IN ('ticket', 'waitlisted', 'cancelled', 'reminder', 'rescheduled')),
  registration_id  uuid NOT NULL REFERENCES registrations(id),
  schedule_version int,
  to_email         text NOT NULL,
  subject          text NOT NULL,
  body_text        text NOT NULL,
  created_at       timestamptz NOT NULL,
  next_attempt_at  timestamptz NOT NULL,
  attempts         int NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error       text,
  sent_at          timestamptz,
  skipped_at       timestamptz,
  CONSTRAINT reminder_has_version CHECK (kind <> 'reminder' OR schedule_version IS NOT NULL),
  CONSTRAINT sent_or_skipped CHECK (NOT (sent_at IS NOT NULL AND skipped_at IS NOT NULL))
);

CREATE INDEX outbox_due ON outbox_emails (next_attempt_at, id)
  WHERE sent_at IS NULL AND skipped_at IS NULL;
