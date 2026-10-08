import type { FastifyPluginAsync } from 'fastify';
import { Type, type Static } from '@sinclair/typebox';
import type { Deps } from '../../app.js';
import { HealthRepository } from './health.repository.js';
import { HealthService } from './health.service.js';

export const HealthResponse = Type.Object({ ok: Type.Literal(true), db: Type.Literal(true) });
export type HealthResponse = Static<typeof HealthResponse>;

export function registerHealthRoutes({ db }: Deps): FastifyPluginAsync {
  const service = new HealthService(new HealthRepository(db));

  return async (app) => {
    app.get('/health', { schema: { response: { 200: HealthResponse } } }, () => service.check());
  };
}
