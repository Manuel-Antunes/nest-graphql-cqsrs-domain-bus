import { MapMemberError } from '@automapper/core';
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
  // A falha na travessia é a falha que ela embrulha — ver `unwrap`.
  MapMemberError,
)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: Error, _host: ArgumentsHost): GraphQLError {
    const cause = DomainExceptionFilter.unwrap(exception);
    return new GraphQLError(DomainExceptionFilter.messageOf(cause), {
      extensions: { code: DomainExceptionFilter.codeOf(cause) },
    });
  }

  /**
   * Descasca o `MapMemberError` até o erro que ele embrulha.
   *
   * Quando um mapeamento valida — e o `UpdatePostInput → UpdatePost` valida, porque um id que não é
   * UUID não pode virar command —, o que chega aqui não é o `ZodError`: é o embrulho. Sem descascar,
   * um id malformado viraria um 500 falando do mapeador, e o cliente perderia a única informação útil,
   * que é o que ele escreveu de errado.
   *
   * O contexto não se perde: o membro e o destino continuam na mensagem que foi para o log. E um
   * embrulho sobre algo que não é falha de entrada continua sendo erro interno, porque o `codeOf`
   * decide pelo tipo do que saiu, não pelo fato de ter havido embrulho.
   */
  private static unwrap(exception: Error): Error {
    return exception instanceof MapMemberError && exception.originalError instanceof Error
      ? DomainExceptionFilter.unwrap(exception.originalError)
      : exception;
  }

  private static codeOf(exception: Error): string {
    if (exception instanceof PostNotFoundException || exception instanceof TagNotFoundException) {
      return 'NOT_FOUND';
    }
    if (exception instanceof PostAlreadyExistsException || exception instanceof TagAlreadyExistsException) {
      return 'CONFLICT';
    }
    // Um erro de mapeamento que sobreviveu ao `unwrap` não é falha de entrada: é configuração errada
    // no perfil, e quem precisa vê-lo é quem mantém o servidor, não quem fez a requisição.
    if (exception instanceof MapMemberError) {
      return 'INTERNAL_SERVER_ERROR';
    }
    return 'BAD_USER_INPUT';
  }

  /**
   * A mensagem que o cliente lê: a do erro, ou a do `ZodError` que ele carrega como causa.
   *
   * As exceções de invariante do domínio (`InvalidPostException` e as irmãs) não traduzem o
   * `safeParse` que as originou — elas o anexam como `cause`. A mensagem delas nomeia a invariante
   * ("post inválido"), que é o que serve ao log; quem sabe *o que* o cliente escreveu de errado, campo
   * a campo, é o `ZodError`. Quando ele está lá, é ele que vai para a resposta.
   *
   * Quem decide o `code` continua sendo o **tipo** da exceção, não a causa: uma recusa de negócio com
   * uma causa qualquer pendurada não muda de categoria por causa dela.
   */
  private static messageOf(exception: Error): string {
    const zodError = DomainExceptionFilter.zodCauseOf(exception);
    return zodError ? z.prettifyError(zodError) : exception.message;
  }

  /** O `ZodError` mais externo da cadeia de causas — ou o próprio erro, quando ele já é um. */
  private static zodCauseOf(exception: unknown): ZodError | undefined {
    if (exception instanceof ZodError) {
      return exception;
    }
    return exception instanceof Error && exception.cause !== undefined
      ? DomainExceptionFilter.zodCauseOf(exception.cause)
      : undefined;
  }
}
