import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch } from '@nestjs/common';
import { ForeignKeyConstraintViolationException } from '@nestposts/database';
import { NotAnAuthorException } from '@nestposts/users/domain/user/exception/not-an-author.exception';
import { GraphQLError } from 'graphql';

@Catch(ForeignKeyConstraintViolationException)
export class AuthorReferenceExceptionFilter implements ExceptionFilter {
  catch(
    _exception: ForeignKeyConstraintViolationException,
    _host: ArgumentsHost,
  ): GraphQLError {
    return new GraphQLError(new NotAnAuthorException().message, {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }
}
