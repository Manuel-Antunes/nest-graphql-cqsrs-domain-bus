import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch } from '@nestjs/common';
import { GraphQLError } from 'graphql';

import { SessionNotAuthenticatedException } from '../domain/auth/exception/session-not-authenticated.exception';

@Catch(SessionNotAuthenticatedException)
export class AuthExceptionFilter implements ExceptionFilter {
  catch(
    exception: SessionNotAuthenticatedException,
    _host: ArgumentsHost,
  ): GraphQLError {
    return new GraphQLError(exception.message, {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }
}
