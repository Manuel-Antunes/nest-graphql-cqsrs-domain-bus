import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { ZodError } from 'zod';

import { ValidationMessage } from './validation-message';

/**
 * **A value that failed its schema, answered in GraphQL**: `BAD_USER_INPUT`, with the issues printed.
 *
 * Kept out of this package's barrel on purpose: the value objects reach the browser, and this is the
 * one file here that needs Nest and GraphQL.
 */
@Catch(ZodError)
export class ValidationExceptionFilter implements ExceptionFilter {
  catch(exception: ZodError, _host: ArgumentsHost): GraphQLError {
    return new GraphQLError(ValidationMessage.of(exception), {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }
}
