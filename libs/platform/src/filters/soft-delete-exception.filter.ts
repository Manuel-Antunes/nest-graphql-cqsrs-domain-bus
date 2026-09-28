import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch } from '@nestjs/common';
import { ValidationMessage } from '@nestposts/validated-dto/filters/validation-message';
import { GraphQLError } from 'graphql';

import { AlreadyDeletedException } from '../domain/shared/soft-delete/already-deleted.exception';
import { NotDeletedException } from '../domain/shared/soft-delete/not-deleted.exception';

@Catch(AlreadyDeletedException, NotDeletedException)
export class SoftDeleteExceptionFilter implements ExceptionFilter {
  catch(exception: Error, _host: ArgumentsHost): GraphQLError {
    return new GraphQLError(ValidationMessage.of(exception), {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }
}
