import { loadConfig } from './config.js';
import { createPool, type Db } from './db.js';

type Seeder = { name: string; run: (db: Db) => Promise<void> };

// Domain tables do not exist yet; slices append their demo data here.
const seeders: Seeder[] = [];

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = createPool(loadConfig().DATABASE_URL);
  try {
    await db.query('SELECT 1');
    for (const seeder of seeders) {
      await seeder.run(db);
      console.log(`seeded ${seeder.name}`);
    }
    if (seeders.length === 0) console.log('nothing to seed yet (no domain tables)');
  } finally {
    await db.end();
  }
}
