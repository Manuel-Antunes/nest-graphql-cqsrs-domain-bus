import {
  ForeignKeyConstraintViolationException,
  NotFoundError,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { DATABASE_EXCEPTIONS, databaseErrorCode } from './database-error';

describe('databaseErrorCode', () => {
  const cases: Array<[Error, string]> = [
    [new ForeignKeyConstraintViolationException(new Error('FOREIGN KEY constraint failed')), 'BAD_USER_INPUT'],
    [new UniqueConstraintViolationException(new Error('UNIQUE constraint failed: tags.name')), 'CONFLICT'],
    [new NotFoundError('Post not found'), 'NOT_FOUND'],
  ];

  it.each(cases)('%s is %s', (exception, code) => {
    expect(databaseErrorCode(exception)).toBe(code);
  });

  it('classifies every exception it declares as catchable', () => {
    expect(DATABASE_EXCEPTIONS).toHaveLength(cases.length);
    for (const [exception] of cases) {
      expect(DATABASE_EXCEPTIONS.some(type => exception instanceof type)).toBe(true);
    }
  });
});
