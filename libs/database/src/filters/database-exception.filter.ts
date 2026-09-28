import { DriverException, NotFoundError } from '@mikro-orm/core';
import type { ArgumentsHost } from '@nestjs/common';
import { Catch, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { GraphQLError } from 'graphql';

import { DatabaseError } from './database-error';

type ContextType = 'http' | 'rpc' | 'ws' | 'graphql';

/**
 * **The global answer to a database failure**, installed by `DatabaseModule.forRoot`.
 *
 * What the failure means is {@link DatabaseError}'s; this says it in the words of the context it
 * happened in:
 *
 * - **GraphQL**: a `GraphQLError` carrying the code (and the field, and whether to retry).
 * - **HTTP**: the status, through Nest's own exception handling, so the reply is the adapter's.
 * - **A message**: the very same exception, rethrown — a transport retries a failed handler, and a
 *   filter that answered would acknowledge it.
 *
 * A failure the caller did not cause (`DatabaseError.of` answers `undefined`) is rethrown in
 * GraphQL, where Yoga masks and reports it, and is a 500 over HTTP. A filter on a handler or a
 * resolver still wins over this one, which is how an application gives a violation a meaning of
 * its own.
 */
@Catch(DriverException, NotFoundError)
export class DatabaseExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(DatabaseExceptionFilter.name);

  override catch(exception: Error, host: ArgumentsHost): unknown {
    const error = DatabaseError.of(exception);
    if (error?.retryable) {
      this.logger.warn(`${error.code}: ${exception.name}`);
    }
    switch (host.getType<ContextType>()) {
      case 'graphql':
        if (!error) {
          throw exception;
        }
        return new GraphQLError(error.message, {
          extensions: error.extensions,
        });
      case 'http':
        return super.catch(error?.toHttpException() ?? exception, host);
      default:
        throw exception;
    }
  }
}
