import type { FastifyError, FastifyInstance } from 'fastify';

/** The one error shape every API response uses. */
export interface ApiErrorBody {
  error: { code: string; message: string };
}

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function body(code: string, message: string): ApiErrorBody {
  return { error: { code, message } };
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((_req, reply) => {
    void reply.status(404).send(body('not_found', 'Not found'));
  });

  app.setErrorHandler((err: FastifyError | AppError, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send(body(err.code, err.message));
    }
    if ('validation' in err && err.validation) {
      return reply.status(400).send(body('validation_error', err.message));
    }
    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send(body('internal_error', 'Internal server error'));
  });
}
