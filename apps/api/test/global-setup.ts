import pg from 'pg';
import { loadConfig } from '../src/config.js';
import { migrate } from '../src/migrate.js';

/** Tests need a real Postgres: fail loudly instead of skipping. */
export default async function setup(): Promise<void> {
  const url = loadConfig().TEST_DATABASE_URL;
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
  } catch {
    throw new Error(`Postgres недоступна на ${url} — запустите npm run db:up`);
  } finally {
    await client.end().catch(() => undefined);
  }
  await migrate(url);
}
