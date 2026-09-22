import {
  ForeignKeyConstraintViolationException,
  NotFoundError,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';

export type DatabaseErrorCode = 'BAD_USER_INPUT' | 'CONFLICT' | 'NOT_FOUND';

export const DATABASE_EXCEPTIONS = [
  ForeignKeyConstraintViolationException,
  UniqueConstraintViolationException,
  NotFoundError,
] as const;

export const databaseErrorCode = (exception: Error): DatabaseErrorCode => {
  if (exception instanceof ForeignKeyConstraintViolationException) {
    return 'BAD_USER_INPUT';
  }
  if (exception instanceof UniqueConstraintViolationException) {
    return 'CONFLICT';
  }
  return 'NOT_FOUND';
};
