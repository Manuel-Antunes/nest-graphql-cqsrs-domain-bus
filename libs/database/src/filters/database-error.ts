import {
  CheckConstraintViolationException,
  ConnectionException,
  DeadlockException,
  DriverException,
  ForeignKeyConstraintViolationException,
  LockWaitTimeoutException,
  NotFoundError,
  NotNullConstraintViolationException,
  RowLevelSecurityViolationException,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { HttpException, HttpStatus } from '@nestjs/common';

export type DatabaseErrorCode =
  | 'BAD_USER_INPUT'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'TIMEOUT'
  | 'SERVICE_UNAVAILABLE';

interface DriverFacts {
  readonly code?: string;
  readonly detail?: string;
  readonly constraint?: string;
  readonly column?: string;
}

/**
 * **What a database failure means to whoever caused it** — the port of `tmp/database`'s filter
 * classification, for PostgreSQL.
 *
 * Built from the facts the driver reports (`code`, `detail`, `constraint`, `column`), which
 * `DriverException` copies from the `pg` error, and NEVER from the exception's message: MikroORM
 * appends the `detail` to it, and the detail carries the offending value.
 *
 * {@link DatabaseError.of} answers `undefined` for a failure the caller could not have caused and
 * cannot work around — a missing table, a syntax error, a privilege the connection lacks: that is
 * the system's, and it is reported as such rather than explained.
 */
export class DatabaseError {
  private static readonly RETRY_AFTER_CONFLICT_MS = 500;

  private static readonly RETRY_AFTER_TIMEOUT_MS = 1000;

  private static readonly UNREACHABLE = new Set([
    '53300',
    '57P01',
    '57P02',
    '57P03',
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
  ]);

  private constructor(
    readonly code: DatabaseErrorCode,
    readonly status: HttpStatus,
    readonly message: string,
    readonly field?: string,
    readonly retryAfter?: number,
  ) {}

  /** A failure that goes away on its own: a collision, a timeout, a database out of reach. */
  get retryable(): boolean {
    return this.status === HttpStatus.SERVICE_UNAVAILABLE;
  }

  /** GraphQL's `extensions`: the code, and what a client can act on. */
  get extensions(): Record<string, unknown> {
    return {
      code: this.code,
      ...(this.field ? { field: this.field } : {}),
      ...(this.retryable ? { retryable: true } : {}),
      ...(this.retryAfter ? { retryAfter: this.retryAfter } : {}),
    };
  }

  /** The same answer over HTTP, for Nest's own exception handling to reply with. */
  toHttpException(): HttpException {
    return new HttpException(
      { statusCode: this.status, message: this.message, ...this.extensions },
      this.status,
    );
  }

  static of(exception: Error): DatabaseError | undefined {
    if (exception instanceof NotFoundError) {
      return DatabaseError.notFound(exception);
    }
    return exception instanceof DriverException
      ? DatabaseError.fromDriver(exception, exception as DriverFacts)
      : undefined;
  }

  private static notFound(exception: NotFoundError): DatabaseError {
    const entity = exception.message.match(/^(\w+) not found/)?.[1];
    return new DatabaseError(
      'NOT_FOUND',
      HttpStatus.NOT_FOUND,
      entity ? `${entity} not found` : 'the record was not found',
    );
  }

  private static fromDriver(
    exception: DriverException,
    facts: DriverFacts,
  ): DatabaseError | undefined {
    const state = facts.code ?? '';
    if (exception instanceof UniqueConstraintViolationException) {
      return DatabaseError.duplicate(facts);
    }
    if (state === '23P01') {
      return new DatabaseError(
        'CONFLICT',
        HttpStatus.CONFLICT,
        'the record overlaps another one',
      );
    }
    if (
      exception instanceof ForeignKeyConstraintViolationException ||
      state === '23001'
    ) {
      return DatabaseError.reference(facts);
    }
    if (exception instanceof NotNullConstraintViolationException) {
      return DatabaseError.input(
        facts.column ? `${facts.column} is required` : 'a value is required',
        facts.column,
      );
    }
    if (exception instanceof CheckConstraintViolationException) {
      return DatabaseError.input(
        facts.constraint
          ? `the value breaks the rule ${facts.constraint}`
          : 'a value breaks a rule of the database',
        facts.column,
      );
    }
    if (state.startsWith('22')) {
      return DatabaseError.input(
        facts.column
          ? `${facts.column} is malformed or out of range`
          : 'a value is malformed or out of range',
        facts.column,
      );
    }
    if (exception instanceof RowLevelSecurityViolationException) {
      return new DatabaseError(
        'FORBIDDEN',
        HttpStatus.FORBIDDEN,
        'a row-level security policy refused the write',
      );
    }
    if (exception instanceof DeadlockException) {
      return new DatabaseError(
        'CONFLICT',
        HttpStatus.SERVICE_UNAVAILABLE,
        'the operation collided with another one; try again',
        undefined,
        DatabaseError.RETRY_AFTER_CONFLICT_MS,
      );
    }
    if (
      exception instanceof LockWaitTimeoutException ||
      state === '55P03' ||
      state === '57014'
    ) {
      return new DatabaseError(
        'TIMEOUT',
        HttpStatus.SERVICE_UNAVAILABLE,
        'the database took too long to answer; try again',
        undefined,
        DatabaseError.RETRY_AFTER_TIMEOUT_MS,
      );
    }
    if (
      exception instanceof ConnectionException ||
      state.startsWith('08') ||
      DatabaseError.UNREACHABLE.has(state)
    ) {
      return new DatabaseError(
        'SERVICE_UNAVAILABLE',
        HttpStatus.SERVICE_UNAVAILABLE,
        'the database is unavailable; try again',
      );
    }
    return undefined;
  }

  private static duplicate(facts: DriverFacts): DatabaseError {
    const field = DatabaseError.keyOf(facts.detail);
    return new DatabaseError(
      'CONFLICT',
      HttpStatus.CONFLICT,
      field
        ? `a record with this ${field} already exists`
        : 'the record already exists',
      field,
    );
  }

  private static reference(facts: DriverFacts): DatabaseError {
    const referencing = facts.detail?.match(
      /still referenced from table "([^"]+)"/,
    )?.[1];
    if (referencing || facts.code === '23001') {
      return new DatabaseError(
        'CONFLICT',
        HttpStatus.CONFLICT,
        referencing
          ? `the record is still referenced by ${referencing}`
          : 'the record is still referenced',
      );
    }
    const referenced = facts.detail?.match(
      /not present in table "([^"]+)"/,
    )?.[1];
    return DatabaseError.input(
      referenced
        ? `the referenced ${referenced} does not exist`
        : 'a referenced record does not exist',
      DatabaseError.keyOf(facts.detail),
    );
  }

  private static input(message: string, field?: string): DatabaseError {
    return new DatabaseError(
      'BAD_USER_INPUT',
      HttpStatus.UNPROCESSABLE_ENTITY,
      message,
      field,
    );
  }

  private static keyOf(detail?: string): string | undefined {
    return detail
      ?.match(/Key \(([^)]+)\)/)?.[1]
      ?.split(',')
      .map((key) => key.trim())
      .join(', ');
  }
}
