import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { errorResponse, API_CODES } from './response';
import type { Context } from 'hono';
import type { Env } from '../types/env';

export function errorHandler() {
  return async (err: Error, c: Context<Env>) => {
    if (err instanceof HTTPException) {
      return c.json(
        errorResponse(
          err.status < 500 ? API_CODES.BAD_REQUEST : API_CODES.INTERNAL_ERROR,
          err.message,
        ),
        err.status,
      );
    }

    if (err instanceof ZodError) {
      return c.json(
        errorResponse(API_CODES.VALIDATION_ERROR, 'Validation failed', err.issues),
        400,
      );
    }

    // Catch Drizzle/Postgres errors with bad parameter messages
    const errMessage = err.message || '';
    const errCause = 'cause' in err ? (err as { cause?: Error }).cause : null;
    const causeMessage = errCause?.message || '';
    if (errMessage.includes('invalid input syntax') || causeMessage.includes('invalid input syntax') || causeMessage.includes('22P02')) {
      return c.json(
        errorResponse(API_CODES.BAD_REQUEST, 'Invalid parameter format'),
        400,
      );
    }

    console.error('[API Error]', err);
    return c.json(
      errorResponse(API_CODES.INTERNAL_ERROR, 'Internal Server Error'),
      500,
    );
  };
}
