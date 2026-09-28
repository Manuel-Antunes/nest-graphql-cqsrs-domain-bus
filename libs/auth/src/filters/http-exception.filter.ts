import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus } from '@nestjs/common';
import { GraphQLError } from 'graphql';

const CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'BAD_USER_INPUT',
};

/**
 * **A Nest `HttpException` in GraphQL's words** — the global guard's refusals, mostly.
 *
 * `@nestjs/apollo` turned the status into `extensions.code` inside the driver; Yoga does not, so a
 * subgraph that authenticates with this package says it here.
 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, _host: ArgumentsHost): GraphQLError {
    const status = exception.getStatus();
    return new GraphQLError(exception.message, {
      extensions: { code: CODES[status] ?? 'INTERNAL_SERVER_ERROR', status },
    });
  }
}
