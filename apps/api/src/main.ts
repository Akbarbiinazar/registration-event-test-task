import { buildApp } from './app.js';
import { SystemClock } from './clock.js';
import { ConfigError, loadConfig } from './config.js';
import { createPool } from './db.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createPool(config.DATABASE_URL);
  const app = buildApp({ db, clock: new SystemClock(), config });

  const shutdown = async (): Promise<void> => {
    await app.close();
    await db.end();
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());

  await app.listen({ host: config.HOST, port: config.PORT });
}

main().catch((err: unknown) => {
  console.error(err instanceof ConfigError ? err.message : err);
  process.exit(1);
});
