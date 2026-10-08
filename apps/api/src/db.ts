import pg from 'pg';

export type Db = pg.Pool;

export function createPool(connectionString: string, options: pg.PoolConfig = {}): Db {
  return new pg.Pool({ connectionString, ...options });
}
