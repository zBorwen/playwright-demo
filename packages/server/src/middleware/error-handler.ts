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
      const issues = err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return c.json(
        errorResponse(API_CODES.VALIDATION_ERROR, 'Validation failed', issues),
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

    if (causeMessage.includes('violates foreign key constraint') || errMessage.includes('violates foreign key constraint') || causeMessage.includes('23503')) {
      return c.json(
        errorResponse(API_CODES.BAD_REQUEST, '关联的数据不存在（请检查 projectId 或 recordingId 是否正确）'),
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
