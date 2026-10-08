import Fastify, { type FastifyInstance } from 'fastify';
import type { Clock } from './clock.js';
import type { Config } from './config.js';
import type { Db } from './db.js';
import { registerErrorHandling } from './errors.js';
import { registerCheckinsRoutes } from './modules/checkins/checkins.controller.js';
import { registerEventsRoutes } from './modules/events/events.controller.js';
import { registerHealthRoutes } from './modules/health/health.controller.js';
import { registerRegistrationRoutes } from './modules/registrations/registrations.controller.js';

export interface Deps {
  db: Db;
  clock: Clock;
  config: Config;
}

export function buildApp(deps: Deps): FastifyInstance {
  const app = Fastify({
    logger: deps.config.NODE_ENV === 'test' ? false : { level: 'info' },
  });

  registerErrorHandling(app);
  void app.register(registerHealthRoutes(deps), { prefix: '/api' });

  void app.register(registerEventsRoutes(deps), { prefix: '/api' });
  void app.register(registerRegistrationRoutes(deps), { prefix: '/api' });
  void app.register(registerCheckinsRoutes(deps), { prefix: '/api' });

  return app;
}
