import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch } from '@nestjs/common';
import { DATABASE_EXCEPTIONS, databaseErrorCode } from '@nestposts/database';
import { NotAnAuthorException } from '@nestposts/users/domain/user/exception/not-an-author.exception';
import { GraphQLError } from 'graphql';

@Catch(...DATABASE_EXCEPTIONS)
export class MikroOrmExceptionFilter implements ExceptionFilter {
  catch(exception: Error, _host: ArgumentsHost): GraphQLError {
    const code = databaseErrorCode(exception);
    if (code === 'BAD_USER_INPUT') {
      return new GraphQLError(new NotAnAuthorException().message, {
        extensions: { code },
      });
    }
    if (code === 'CONFLICT') {
      return new GraphQLError('o valor informado já está em uso', {
        extensions: { code },
      });
    }
    return new GraphQLError('não existe', { extensions: { code } });
  }
}
