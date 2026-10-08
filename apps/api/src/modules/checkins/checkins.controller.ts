import type { FastifyPluginAsync } from 'fastify';
import { Type, type Static } from '@sinclair/typebox';
import type { Deps } from '../../app.js';
import { EventsRepository } from '../events/events.repository.js';
import { EventsService } from '../events/events.service.js';
import { CheckinsRepository } from './checkins.repository.js';
import { CheckinsService } from './checkins.service.js';

const Params = Type.Object({ id: Type.String() });
const Body = Type.Object(
  { code: Type.String({ minLength: 1, maxLength: 64 }) },
  { additionalProperties: false },
);
const Response = Type.Object({ checkedInAt: Type.String() });

export function registerCheckinsRoutes({ db, clock }: Deps): FastifyPluginAsync {
  const service = new CheckinsService(
    new CheckinsRepository(db),
    new EventsService(new EventsRepository(db), clock),
    clock,
  );
  return async (app) => {
    app.post<{ Params: Static<typeof Params>; Body: Static<typeof Body> }>(
      '/organizer/events/:id/checkins',
      { schema: { params: Params, body: Body, response: { 200: Response } } },
      (req) => service.checkIn(req.params.id, req.body.code, req.headers.authorization),
    );
  };
}
