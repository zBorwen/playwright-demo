export const API_CODES = {
  OK: 'OK',
  NOT_FOUND: 'NOT_FOUND',
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  AGENT_UNAVAILABLE: 'AGENT_UNAVAILABLE',
} as const;

export type ApiCode = (typeof API_CODES)[keyof typeof API_CODES];

export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  code: ApiCode;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details: unknown;
  };
}

export function successResponse<T>(data: T, code: ApiCode = API_CODES.OK): SuccessResponse<T> {
  return { success: true, data, code };
}

export function errorResponse(code: string, message: string, details?: unknown): ErrorResponse {
  return { success: false, error: { code, message, details } };
}
