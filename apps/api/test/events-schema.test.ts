import { describe, expect, it } from 'vitest';
import { testPool } from './helpers/db.js';

const insert = (capacity: number, seatsTaken: number) =>
  testPool.query(
    `INSERT INTO events (title, starts_at, timezone, capacity, seats_taken, organizer_token_hash, created_at, updated_at)
     VALUES ('t', '2027-01-01T00:00:00Z', 'UTC', $1, $2, 'h', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
    [capacity, seatsTaken],
  );

describe('events CHECK constraints', () => {
  it('rejects capacity = 0', async () => {
    await expect(insert(0, 0)).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects seats_taken above capacity', async () => {
    await expect(insert(1, 2)).rejects.toMatchObject({ code: '23514' });
  });
});
