import { afterAll, beforeEach } from 'vitest';
import { testPool } from './helpers/db.js';

// Every test starts from empty tables (migrations table excluded).
beforeEach(async () => {
  const { rows } = await testPool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> 'schema_migrations'`,
  );
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
  await testPool.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
});

afterAll(async () => {
  await testPool.end();
});
