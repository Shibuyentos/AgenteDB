import type { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'Erro interno do servidor';

  console.error(`[ERROR] ${code}: ${message}`);

  res.status(statusCode).json({
    error: message,
    code,
  });
}

export function createApiError(
  message: string,
  statusCode: number = 500,
  code: string = 'INTERNAL_ERROR'
): ApiError {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  error.code = code;
  return error;
}
