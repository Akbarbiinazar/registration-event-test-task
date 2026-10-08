import { AppError } from '../../errors.js';
import type { HealthRepository } from './health.repository.js';

export class HealthService {
  constructor(private readonly repository: HealthRepository) {}

  async check(): Promise<{ ok: true; db: true }> {
    try {
      await this.repository.pingDb();
    } catch {
      throw new AppError(503, 'db_unavailable', 'Database is unavailable');
    }
    return { ok: true, db: true };
  }
}
