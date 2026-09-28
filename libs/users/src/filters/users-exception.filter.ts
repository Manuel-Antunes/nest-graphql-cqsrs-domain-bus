import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch } from '@nestjs/common';
import { ValidationMessage } from '@nestposts/validated-dto/filters/validation-message';
import { GraphQLError } from 'graphql';

import { NotAnAuthorException } from '../domain/user/exception/not-an-author.exception';
import { UnknownIdentityException } from '../domain/user/exception/unknown-identity.exception';
import { UserNotFoundException } from '../domain/user/exception/user-not-found.exception';

@Catch(UserNotFoundException, UnknownIdentityException, NotAnAuthorException)
export class UsersExceptionFilter implements ExceptionFilter {
  catch(exception: Error, _host: ArgumentsHost): GraphQLError {
    return new GraphQLError(ValidationMessage.of(exception), {
      extensions: { code: UsersExceptionFilter.codeOf(exception) },
    });
  }

  private static codeOf(exception: Error): string {
    return exception instanceof NotAnAuthorException
      ? 'FORBIDDEN'
      : 'NOT_FOUND';
  }
}
