import type { FastifyPluginAsync } from 'fastify';
import { Type, type Static } from '@sinclair/typebox';
import type { Deps } from '../../app.js';
import { EventsRepository } from './events.repository.js';
import { EventsService } from './events.service.js';

const PublicEventSchema = Type.Object({
  id: Type.String(),
  title: Type.String(),
  description: Type.String(),
  startsAt: Type.String(),
  startsAtLabel: Type.String(),
  timezone: Type.String(),
  capacity: Type.Integer(),
  seatsLeft: Type.Integer(),
  hasStarted: Type.Boolean(),
});

const CreateEventBody = Type.Object(
  {
    title: Type.String({ minLength: 1, maxLength: 200, pattern: '\\S' }),
    description: Type.Optional(Type.String({ maxLength: 10000 })),
    // ISO 8601 with an explicit offset: a bare "2030" or a zone-less time would be read in the server's zone.
    startsAt: Type.String({
      pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?(Z|[+-]\\d{2}:\\d{2})$',
    }),
    timezone: Type.String({ minLength: 1 }),
    capacity: Type.Integer({ minimum: 1, maximum: 10000 }),
  },
  { additionalProperties: false },
);
type CreateEventBody = Static<typeof CreateEventBody>;

// Not format: 'uuid' - a malformed id is simply an event that does not exist (404, not 400).
const IdParams = Type.Object({ id: Type.String() });

export function registerEventsRoutes({ db, clock }: Deps): FastifyPluginAsync {
  const service = new EventsService(new EventsRepository(db), clock);

  return async (app) => {
    app.post<{ Body: CreateEventBody }>(
      '/events',
      {
        schema: {
          body: CreateEventBody,
          response: {
            201: Type.Object({ event: PublicEventSchema, organizerKey: Type.String() }),
          },
        },
      },
      async (req, reply) => reply.status(201).send(await service.create(req.body)),
    );

    app.get('/events', { schema: { response: { 200: Type.Array(PublicEventSchema) } } }, () =>
      service.list(),
    );

    app.get<{ Params: Static<typeof IdParams> }>(
      '/events/:id',
      { schema: { params: IdParams, response: { 200: PublicEventSchema } } },
      (req) => service.get(req.params.id),
    );

    app.get<{ Params: Static<typeof IdParams> }>(
      '/organizer/events/:id',
      { schema: { params: IdParams } },
      (req) => service.getForOrganizer(req.params.id, req.headers.authorization),
    );
  };
}
