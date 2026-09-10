import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { z, ZodError } from 'zod';
import { InvalidPostException } from '../../domain/post/exception/invalid-post.exception';
import { PostAlreadyExistsException } from '../../domain/post/exception/post-already-exists.exception';
import { PostNotFoundException } from '../../domain/post/exception/post-not-found.exception';
import { AlreadyDeletedException } from '../../domain/shared/already-deleted.exception';
import { NotDeletedException } from '../../domain/shared/not-deleted.exception';
import { InvalidTagException } from '../../domain/tag/exception/invalid-tag.exception';
import { TagAlreadyExistsException } from '../../domain/tag/exception/tag-already-exists.exception';
import { TagNotFoundException } from '../../domain/tag/exception/tag-not-found.exception';

/**
 * Traduz as exceções do domínio (e o `ZodError` de um id malformado na borda) para erros GraphQL com
 * `extensions.code` — é o `AppGraphQlExceptionHandler` da versão Java, como *exception filter* do
 * Nest registrado em `APP_FILTER`.
 *
 * Num resolver GraphQL o filtro não escreve resposta: **devolve** o erro, e o @nestjs/graphql o
 * lança de volta para o graphql-js, que o coloca em `errors[]`. As exceções em si continuam nos seus
 * domínios (são vocabulário deles); o que mora aqui é quem as *ouve* na borda.
 */
@Catch(
  InvalidPostException,
  InvalidTagException,
  PostNotFoundException,
  TagNotFoundException,
  PostAlreadyExistsException,
  TagAlreadyExistsException,
  // as duas guardas do mixin SoftDeletable: apagar o apagado, restaurar o vivo
  AlreadyDeletedException,
  NotDeletedException,
  ZodError,
)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: Error, _host: ArgumentsHost): GraphQLError {
    return new GraphQLError(DomainExceptionFilter.messageOf(exception), {
      extensions: { code: DomainExceptionFilter.codeOf(exception) },
    });
  }

  private static codeOf(exception: Error): string {
    if (exception instanceof PostNotFoundException || exception instanceof TagNotFoundException) {
      return 'NOT_FOUND';
    }
    if (exception instanceof PostAlreadyExistsException || exception instanceof TagAlreadyExistsException) {
      return 'CONFLICT';
    }
    return 'BAD_USER_INPUT';
  }

  private static messageOf(exception: Error): string {
    return exception instanceof ZodError ? z.prettifyError(exception) : exception.message;
  }
}
