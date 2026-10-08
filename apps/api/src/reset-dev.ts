import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { seedEvents } from './seed.js';

const databaseUrl = new URL(loadConfig().DATABASE_URL);
if (
  !['localhost', '127.0.0.1'].includes(databaseUrl.hostname) ||
  databaseUrl.pathname !== '/events' ||
  !process.argv.includes('--confirm=events')
) {
  throw new Error('Dev reset requires the local events database and --confirm=events');
}

const db = createPool(databaseUrl.toString());
try {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE events RESTART IDENTITY CASCADE');
    const count = await seedEvents(client);
    await client.query('COMMIT');
    console.log(`Reset complete; seeded ${count} events`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
} finally {
  await db.end();
}
