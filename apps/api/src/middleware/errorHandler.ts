import type { ErrorRequestHandler } from 'express';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface ApiErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
  };
}

function statusToCode(status: number): ErrorCode {
  switch (status) {
    case 400: return 'VALIDATION_ERROR';
    case 401: return 'UNAUTHORIZED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 409: return 'CONFLICT';
    case 429: return 'RATE_LIMITED';
    default: return 'INTERNAL_ERROR';
  }
}

export class HttpError extends Error {
  public code: ErrorCode;

  constructor(
    public statusCode: number,
    message: string,
    code?: ErrorCode,
  ) {
    super(message);
    this.name = 'HttpError';
    this.code = code ?? statusToCode(statusCode);
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const statusCode = err instanceof HttpError ? err.statusCode : 500;
  const code: ErrorCode = err instanceof HttpError ? err.code : 'INTERNAL_ERROR';
  const message = err.message ?? 'Internal server error';

  if (statusCode >= 500) {
    console.error('[ERROR]', message, err.stack);
  }

  const response: ApiErrorResponse = {
    success: false,
    error: { code, message },
  };

  res.status(statusCode).json(response);
};
