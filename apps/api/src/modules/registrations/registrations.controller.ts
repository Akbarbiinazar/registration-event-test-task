import type { FastifyPluginAsync } from 'fastify';
import { Type, type Static } from '@sinclair/typebox';
import type { Deps } from '../../app.js';
import { RegistrationsRepository } from './registrations.repository.js';
import { RegistrationsService } from './registrations.service.js';

const RegisterParams = Type.Object({ id: Type.String() });
const RegisterBody = Type.Object(
  { email: Type.String({ minLength: 3, maxLength: 324 }) },
  { additionalProperties: false },
);
const TicketParams = Type.Object({ manageToken: Type.String() });
const RegisterResponse = Type.Object({
  status: Type.Union([Type.Literal('confirmed'), Type.Literal('waitlisted')]),
  alreadyRegistered: Type.Boolean(),
});
const TicketResponse = Type.Object({
  event: Type.Object({ id: Type.String(), title: Type.String(), startsAtLabel: Type.String() }),
  status: Type.Union([
    Type.Literal('confirmed'),
    Type.Literal('waitlisted'),
    Type.Literal('cancelled'),
  ]),
  code: Type.Optional(Type.String()),
});

export function registerRegistrationRoutes(deps: Deps): FastifyPluginAsync {
  const service = new RegistrationsService(
    new RegistrationsRepository(deps.db),
    deps.clock,
    deps.config,
  );
  return async (app) => {
    app.post<{
      Params: Static<typeof RegisterParams>;
      Body: Static<typeof RegisterBody>;
    }>(
      '/events/:id/registrations',
      {
        schema: {
          params: RegisterParams,
          body: RegisterBody,
          response: { 201: RegisterResponse },
        },
      },
      async (req, reply) =>
        reply.status(201).send(await service.register(req.params.id, req.body.email)),
    );
    app.get<{ Params: Static<typeof TicketParams> }>(
      '/tickets/:manageToken',
      { schema: { params: TicketParams, response: { 200: TicketResponse } } },
      (req) => service.ticket(req.params.manageToken),
    );
  };
}
