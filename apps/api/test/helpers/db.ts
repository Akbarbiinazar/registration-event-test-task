import { loadConfig } from '../../src/config.js';
import { createPool } from '../../src/db.js';

export const testConfig = { ...loadConfig(), NODE_ENV: 'test' as const };

/** Pool for the test database; size leaves room for real concurrency tests. */
export const testPool = createPool(testConfig.TEST_DATABASE_URL, { max: 25 });
