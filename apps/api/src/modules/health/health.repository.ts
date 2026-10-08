import type { Db } from '../../db.js';

export class HealthRepository {
  constructor(private readonly db: Db) {}

  async pingDb(): Promise<void> {
    await this.db.query('SELECT 1');
  }
}
