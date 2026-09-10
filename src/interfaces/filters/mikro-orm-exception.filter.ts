import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import {
  ForeignKeyConstraintViolationException,
  NotFoundError,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { GraphQLError } from 'graphql';
import { NotAnAuthorException } from '../../domain/user/exception/not-an-author.exception';

/**
 * Violação de integridade do banco → erro de domínio.
 *
 * ## Por que deixar o banco recusar
 * As restrições não são rede de segurança: são **a** garantia. Um SELECT antes do INSERT sempre tem uma
 * janela — a linha pode sumir entre a leitura e a escrita — e a restrição não tem. Validar antes
 * tranquiliza sem proteger, e ainda custa uma consulta por operação.
 *
 * O que faltava para poder confiar nelas era isto: um erro de integridade não pode chegar ao cliente
 * como `INTERNAL_SERVER_ERROR` com uma mensagem de driver. Traduzido, ele vira o mesmo erro que uma
 * checagem na aplicação produziria — e o resto do sistema não precisa saber a diferença.
 *
 * ## O que ele traduz, e o que ele deixa passar
 * - **FK** → `NotAnAuthorException` sem id: no `createPost` a única chave estrangeira que a escrita
 *   pode violar é a do autor. A mensagem é vaga porque a FK não distingue "não existe" de "é leitor",
 *   e distinguir seria um oráculo — ver {@link NotAnAuthorException};
 * - **unique** → `CONFLICT`, que é o que uma corrida por `tags.name` ou pelo email de um user é;
 * - **`NotFoundError`** (de um `findOneOrFail`) → `NOT_FOUND`.
 *
 * O resto sobe como está: um erro de driver que este filtro não reconhece é bug ou indisponibilidade,
 * e mascará-lo de erro de usuário seria pior do que deixá-lo aparecer.
 *
 * ## Onde ele é aplicado
 * Nos resolvers que escrevem (`@UseFilters`), e não globalmente: é lá que uma violação de integridade
 * é uma resposta possível ao que o cliente pediu. Numa leitura ela seria outra coisa.
 */
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
