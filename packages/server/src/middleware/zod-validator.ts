import { zValidator as baseZValidator } from '@hono/zod-validator';
import type { z } from 'zod';
import type { Context, Env as HonoEnv, ValidationTargets } from 'hono';

export function zValidator<Target extends keyof ValidationTargets, Schema extends z.ZodType>(
  target: Target,
  schema: Schema,
) {
  return baseZValidator(target, schema, async (result, c: Context<HonoEnv>) => {
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return c.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details,
          },
        },
        400,
      );
    }
  });
}
