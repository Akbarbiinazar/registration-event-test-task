import { buildApp } from './app.js';
import { SystemClock } from './clock.js';
import { ConfigError, loadConfig } from './config.js';
import { createPool } from './db.js';
import { runMailerTick } from './jobs/mailer.js';
import { runReminderTick } from './jobs/reminders.js';
import { createSmtpTransport } from './jobs/smtp.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = createPool(config.DATABASE_URL);
  const clock = new SystemClock();
  const app = buildApp({ db, clock, config });
  const transport = createSmtpTransport(config);
  const mailerDeps = { db, clock, mailFrom: config.MAIL_FROM };
  const reminderDeps = { db, clock };

  await app.listen({ host: config.HOST, port: config.PORT });
  const timer = setInterval(() => {
    void runMailerTick(mailerDeps, transport).catch((error: unknown) => {
      app.log.error({ error }, 'mailer tick failed');
    });
  }, config.MAILER_TICK_MS);

  let stopping = false;
  let reminderTimer: NodeJS.Timeout | undefined;
  let reminderTask: Promise<void> | undefined;
  const runReminderAndScheduleNext = async (): Promise<void> => {
    try {
      await runReminderTick(reminderDeps);
    } catch (error) {
      app.log.error({ error }, 'reminder tick failed');
    } finally {
      if (!stopping) {
        reminderTimer = setTimeout(() => {
          reminderTask = runReminderAndScheduleNext();
        }, config.REMINDER_TICK_MS);
      }
    }
  };
  reminderTask = runReminderAndScheduleNext();

  const shutdown = async (): Promise<void> => {
    stopping = true;
    clearInterval(timer);
    if (reminderTimer) clearTimeout(reminderTimer);
    await reminderTask;
    await app.close();
    transport.close();
    await db.end();
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

main().catch((err: unknown) => {
  console.error(err instanceof ConfigError ? err.message : err);
  process.exit(1);
});
