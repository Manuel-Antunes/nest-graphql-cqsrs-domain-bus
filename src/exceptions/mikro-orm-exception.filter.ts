import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import {
  ForeignKeyConstraintViolationException,
  NotFoundError,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { GraphQLError } from 'graphql';
import { NotAnAuthorException } from '../domain/user/exception/not-an-author.exception';

@Catch(ForeignKeyConstraintViolationException, UniqueConstraintViolationException, NotFoundError)
export class MikroOrmExceptionFilter implements ExceptionFilter {
  catch(exception: Error, _host: ArgumentsHost): GraphQLError {
    if (exception instanceof ForeignKeyConstraintViolationException) {
      const translated = new NotAnAuthorException();
      return new GraphQLError(translated.message, { extensions: { code: 'BAD_USER_INPUT' } });
    }
    if (exception instanceof UniqueConstraintViolationException) {
      return new GraphQLError('o valor informado já está em uso', { extensions: { code: 'CONFLICT' } });
    }
    return new GraphQLError('não existe', { extensions: { code: 'NOT_FOUND' } });
  }
}
