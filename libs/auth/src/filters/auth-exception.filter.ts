import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch } from '@nestjs/common';
import { GraphQLError } from 'graphql';

import { IdentityIsNotAUserException } from '../domain/auth/exception/identity-is-not-a-user.exception';
import { SessionNotAuthenticatedException } from '../domain/auth/exception/session-not-authenticated.exception';

@Catch(SessionNotAuthenticatedException, IdentityIsNotAUserException)
export class AuthExceptionFilter implements ExceptionFilter {
  catch(
    exception: SessionNotAuthenticatedException | IdentityIsNotAUserException,
    _host: ArgumentsHost,
  ): GraphQLError {
    return new GraphQLError(exception.message, {
      extensions: {
        code:
          exception instanceof IdentityIsNotAUserException
            ? 'FORBIDDEN'
            : 'UNAUTHENTICATED',
      },
    });
  }
}
