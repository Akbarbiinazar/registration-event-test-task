CREATE TABLE events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description          text NOT NULL DEFAULT '',
  starts_at            timestamptz NOT NULL,
  timezone             text NOT NULL,
  capacity             int  NOT NULL CHECK (capacity BETWEEN 1 AND 10000),
  seats_taken          int  NOT NULL DEFAULT 0,
  schedule_version     int  NOT NULL DEFAULT 1,
  organizer_token_hash text NOT NULL,
  created_at           timestamptz NOT NULL,
  updated_at           timestamptz NOT NULL,
  CONSTRAINT seats_within_capacity CHECK (seats_taken BETWEEN 0 AND capacity)
);

CREATE INDEX events_starts_at ON events (starts_at);
