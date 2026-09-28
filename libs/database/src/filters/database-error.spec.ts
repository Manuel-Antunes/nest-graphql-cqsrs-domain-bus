import {
  CheckConstraintViolationException,
  ConnectionException,
  DeadlockException,
  DriverException,
  ForeignKeyConstraintViolationException,
  NotFoundError,
  NotNullConstraintViolationException,
  RowLevelSecurityViolationException,
  SyntaxErrorException,
  TableNotFoundException,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { HttpStatus } from '@nestjs/common';

import { DatabaseError } from './database-error';

const SECRET = 'manuel@example.com';

const pgError = (code: string, facts: Record<string, string> = {}) =>
  Object.assign(new Error(`driver says ${SECRET}`), { code, ...facts });

describe('DatabaseError', () => {
  it('a unique violation is a CONFLICT that names the key, never its value', () => {
    const error = DatabaseError.of(
      new UniqueConstraintViolationException(
        pgError('23505', {
          detail: `Key (email)=(${SECRET}) already exists.`,
          constraint: 'users_email_unique',
        }),
      ),
    );

    expect(error).toMatchObject({
      code: 'CONFLICT',
      status: HttpStatus.CONFLICT,
      field: 'email',
      message: 'a record with this email already exists',
    });
  });

  it('a composite key is named whole', () => {
    const error = DatabaseError.of(
      new UniqueConstraintViolationException(
        pgError('23505', {
          detail: `Key (email, organization_id)=(${SECRET}, x) already exists.`,
        }),
      ),
    );

    expect(error?.field).toBe('email, organization_id');
  });

  it('a reference to nothing is BAD_USER_INPUT naming what is missing', () => {
    const error = DatabaseError.of(
      new ForeignKeyConstraintViolationException(
        pgError('23503', {
          detail: 'Key (author_id)=(x) is not present in table "authors".',
        }),
      ),
    );

    expect(error).toMatchObject({
      code: 'BAD_USER_INPUT',
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      field: 'author_id',
      message: 'the referenced authors does not exist',
    });
  });

  it('deleting what is still referenced is a CONFLICT, not bad input', () => {
    const error = DatabaseError.of(
      new ForeignKeyConstraintViolationException(
        pgError('23503', {
          detail: 'Key (id)=(x) is still referenced from table "posts".',
        }),
      ),
    );

    expect(error).toMatchObject({
      code: 'CONFLICT',
      status: HttpStatus.CONFLICT,
      message: 'the record is still referenced by posts',
    });
  });

  it.each([
    [
      'a restrict violation',
      new DriverException(pgError('23001')),
      'CONFLICT',
      HttpStatus.CONFLICT,
    ],
    [
      'an exclusion violation',
      new DriverException(pgError('23P01')),
      'CONFLICT',
      HttpStatus.CONFLICT,
    ],
    [
      'a missing value',
      new NotNullConstraintViolationException(
        pgError('23502', { column: 'title' }),
      ),
      'BAD_USER_INPUT',
      HttpStatus.UNPROCESSABLE_ENTITY,
    ],
    [
      'a check constraint',
      new CheckConstraintViolationException(
        pgError('23514', { constraint: 'events_window_check' }),
      ),
      'BAD_USER_INPUT',
      HttpStatus.UNPROCESSABLE_ENTITY,
    ],
    [
      'a malformed value',
      new DriverException(pgError('22P02')),
      'BAD_USER_INPUT',
      HttpStatus.UNPROCESSABLE_ENTITY,
    ],
    [
      'a row-level security refusal',
      new RowLevelSecurityViolationException(pgError('42501')),
      'FORBIDDEN',
      HttpStatus.FORBIDDEN,
    ],
    [
      'a deadlock',
      new DeadlockException(pgError('40P01')),
      'CONFLICT',
      HttpStatus.SERVICE_UNAVAILABLE,
    ],
    [
      'a lock that was not granted in time',
      new DriverException(pgError('55P03')),
      'TIMEOUT',
      HttpStatus.SERVICE_UNAVAILABLE,
    ],
    [
      'a database out of reach',
      new ConnectionException(pgError('08006')),
      'SERVICE_UNAVAILABLE',
      HttpStatus.SERVICE_UNAVAILABLE,
    ],
    [
      'a refused connection',
      new DriverException(pgError('ECONNREFUSED')),
      'SERVICE_UNAVAILABLE',
      HttpStatus.SERVICE_UNAVAILABLE,
    ],
  ])('%s is %s', (_, exception, code, status) => {
    expect(DatabaseError.of(exception)).toMatchObject({ code, status });
  });

  it('what goes away on its own says so, and when to try again', () => {
    const deadlock = DatabaseError.of(new DeadlockException(pgError('40001')));
    const refused = DatabaseError.of(new ConnectionException(pgError('08006')));
    const duplicate = DatabaseError.of(
      new UniqueConstraintViolationException(pgError('23505')),
    );

    expect(deadlock?.extensions).toEqual({
      code: 'CONFLICT',
      retryable: true,
      retryAfter: 500,
    });
    expect(refused?.extensions).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      retryable: true,
    });
    expect(duplicate?.retryable).toBe(false);
  });

  it('a record findOneOrFail did not find is NOT_FOUND, named by its entity', () => {
    const error = DatabaseError.of(
      NotFoundError.findOneFailed('Post', { id: SECRET }),
    );

    expect(error).toMatchObject({
      code: 'NOT_FOUND',
      status: HttpStatus.NOT_FOUND,
      message: 'Post not found',
    });
  });

  it.each([
    ['a syntax error', new SyntaxErrorException(pgError('42601'))],
    ['a missing table', new TableNotFoundException(pgError('42P01'))],
    ['a privilege the connection lacks', new DriverException(pgError('42501'))],
    ['anything that is not the database', new Error(SECRET)],
  ])('%s is not the caller’s to explain', (_, exception) => {
    expect(DatabaseError.of(exception)).toBeUndefined();
  });

  it('never repeats what the driver said', () => {
    const exceptions = [
      new UniqueConstraintViolationException(
        pgError('23505', { detail: `Key (email)=(${SECRET}) already exists.` }),
      ),
      new ForeignKeyConstraintViolationException(pgError('23503')),
      new NotNullConstraintViolationException(pgError('23502')),
      new DriverException(pgError('22001')),
      new DeadlockException(pgError('40P01')),
    ];

    for (const exception of exceptions) {
      expect(DatabaseError.of(exception)?.message).not.toContain(SECRET);
    }
  });

  it('answers HTTP with its status and the same facts GraphQL gets', () => {
    const error = DatabaseError.of(
      new UniqueConstraintViolationException(
        pgError('23505', { detail: 'Key (name)=(x) already exists.' }),
      ),
    );

    const http = error?.toHttpException();

    expect(http?.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(http?.getResponse()).toEqual({
      statusCode: HttpStatus.CONFLICT,
      message: 'a record with this name already exists',
      code: 'CONFLICT',
      field: 'name',
    });
  });
});
