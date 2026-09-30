import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch } from '@nestjs/common';
import { ValidationMessage } from '@nestposts/validated-dto/filters/validation-message';
import { GraphQLError } from 'graphql';

import { ClientNotFoundException } from '../domain/client/exception/client-not-found.exception';
import { InvalidClientException } from '../domain/client/exception/invalid-client.exception';

@Catch(InvalidClientException, ClientNotFoundException)
export class ClientExceptionFilter implements ExceptionFilter {
  catch(exception: Error, _host: ArgumentsHost): GraphQLError {
    return new GraphQLError(ValidationMessage.of(exception), {
      extensions: {
        code:
          exception instanceof ClientNotFoundException
            ? 'NOT_FOUND'
            : 'BAD_USER_INPUT',
      },
    });
  }
}
