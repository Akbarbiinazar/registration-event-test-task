import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('applies defaults for an empty environment', () => {
    const config = loadConfig({});
    expect(config.PORT).toBe(3000);
    expect(config.DATABASE_URL).toMatch(/^postgres:\/\//);
  });

  it('rejects an invalid PORT and a non-postgres DATABASE_URL, listing both', () => {
    const attempt = () => loadConfig({ PORT: 'abc', DATABASE_URL: 'mysql://x' });
    expect(attempt).toThrow(ConfigError);
    expect(attempt).toThrow(/PORT/);
    expect(attempt).toThrow(/DATABASE_URL/);
  });
});
