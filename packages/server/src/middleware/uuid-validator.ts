import type { MiddlewareHandler } from 'hono';
import { errorResponse, API_CODES } from './response';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateUuidParam(paramName: string): MiddlewareHandler {
  return async (c, next) => {
    const val = c.req.param(paramName);
    if (val && !UUID_REGEX.test(val)) {
      return c.json(errorResponse(API_CODES.BAD_REQUEST, `参数 ${paramName} 格式错误，必须为 UUID`), 400);
    }
    await next();
  };
}
