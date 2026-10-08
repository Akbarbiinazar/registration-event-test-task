import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

const ConfigSchema = Type.Object({
  NODE_ENV: Type.Union(
    [Type.Literal('development'), Type.Literal('test'), Type.Literal('production')],
    { default: 'development' },
  ),
  HOST: Type.String({ minLength: 1, default: '127.0.0.1' }),
  PORT: Type.Integer({ minimum: 1, maximum: 65535, default: 3000 }),
  DATABASE_URL: Type.String({
    pattern: '^postgres(ql)?://',
    default: 'postgres://events:events@localhost:5433/events',
  }),
  TEST_DATABASE_URL: Type.String({
    pattern: '^postgres(ql)?://',
    default: 'postgres://events:events@localhost:5433/events_test',
  }),
  WEB_BASE_URL: Type.String({ pattern: '^https?://', default: 'http://localhost:5173' }),
  SMTP_HOST: Type.String({ minLength: 1, default: '127.0.0.1' }),
  SMTP_PORT: Type.Integer({ minimum: 1, maximum: 65535, default: 1025 }),
  MAIL_FROM: Type.String({ minLength: 1, default: 'Билеты <tickets@events.local>' }),
  MAILER_TICK_MS: Type.Integer({ minimum: 100, default: 1000 }),
  REMINDER_TICK_MS: Type.Integer({ minimum: 100, default: 60_000 }),
});

export type Config = Static<typeof ConfigSchema>;

export class ConfigError extends Error {}

/** Validates the environment once, at startup; throws with every problem listed. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const raw: Record<string, unknown> = {};
  for (const key of Object.keys(ConfigSchema.properties)) {
    const value = env[key];
    if (value === undefined || value === '') continue;
    raw[key] =
      key === 'PORT' ||
      key === 'SMTP_PORT' ||
      key === 'MAILER_TICK_MS' ||
      key === 'REMINDER_TICK_MS'
        ? Number(value)
        : value;
  }
  const withDefaults = Value.Default(ConfigSchema, raw);
  const errors = [...Value.Errors(ConfigSchema, withDefaults)];
  if (errors.length > 0) {
    const lines = errors.map((e) => `  ${e.path.slice(1)}: ${e.message}`);
    throw new ConfigError(`Invalid environment:\n${lines.join('\n')}`);
  }
  return withDefaults as Config;
}
