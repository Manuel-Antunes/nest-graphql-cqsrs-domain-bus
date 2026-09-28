import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch } from '@nestjs/common';
import { GraphQLError } from 'graphql';

import { UploadNotOwnedException } from '../domain/asset/upload-area';

/** **An upload claimed by someone who did not make it**, refused in GraphQL as bad input. */
@Catch(UploadNotOwnedException)
export class AssetExceptionFilter implements ExceptionFilter {
  catch(
    exception: UploadNotOwnedException,
    _host: ArgumentsHost,
  ): GraphQLError {
    return new GraphQLError(exception.message, {
      extensions: { code: 'BAD_USER_INPUT' },
    });
  }
}
