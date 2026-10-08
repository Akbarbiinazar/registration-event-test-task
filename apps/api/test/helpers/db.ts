import { loadConfig } from '../../src/config.js';
import { createPool } from '../../src/db.js';

export const testConfig = { ...loadConfig(), NODE_ENV: 'test' as const };

/** Pool for the test database; size leaves room for real concurrency tests. */
export const testPool = createPool(testConfig.TEST_DATABASE_URL, { max: 25 });

/** Checks the counters and waitlist invariant against real committed rows. */
export async function assertInvariants(): Promise<void> {
  const { rows } = await testPool.query<{
    id: string;
    capacity: number;
    seats_taken: number;
    confirmed: string;
    waitlisted: string;
  }>(
    `SELECT e.id, e.capacity, e.seats_taken,
            count(r.id) FILTER (WHERE r.status = 'confirmed') AS confirmed,
            count(r.id) FILTER (WHERE r.status = 'waitlisted') AS waitlisted
     FROM events e LEFT JOIN registrations r ON r.event_id = e.id
     GROUP BY e.id`,
  );
  for (const event of rows) {
    if (event.seats_taken !== Number(event.confirmed)) {
      throw new Error(`Event ${event.id}: seats_taken differs from confirmed registrations`);
    }
    if (Number(event.waitlisted) > 0 && event.seats_taken < event.capacity) {
      throw new Error(`Event ${event.id}: waitlist exists while seats are free`);
    }
  }
}
