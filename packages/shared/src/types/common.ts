/** Standard API response wrapper */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
}

export interface ApiError {
  code: ErrorCode;
  message: string;
}

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'NAME_TAKEN'
  | 'INSUFFICIENT_FUNDS'
  | 'NO_VACANCY'
  | 'NOT_QUALIFIED'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

/** Pagination */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

/** Base entity with timestamps */
export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}
