import type { Mapper } from '@automapper/core';
import { InjectMapper } from '@automapper/nestjs';
import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { concatMap, type Observable } from 'rxjs';
import { type User } from '../../domain/user/user.entity';
import { Author } from '../../domain/user/author.entity';
import { Reader } from '../../domain/user/reader.entity';
import { AuthorView, ReaderView, type UserView } from '../../dto/graphql/user.view';

/**
 * `User` → a view do tipo dele. O único interceptor do projeto que **escolhe** um mapeamento em vez de
 * aplicar um — porque quem decide entre `Reader` e `Author` é o runtime (herança multi-tabela: existe
 * linha em `authors`, ou não existe), e isso não é uma pergunta sobre campos.
 *
 * A triagem é uma linha, e a pergunta é do domínio: `canWritePosts()`, que é `this is Author`. A borda
 * não reimplementa a regra, usa a que o agregado já publica — a mesma do `AuthorPipe`, com o propósito
 * invertido: o pipe **autoriza** (e recusa quem não escreve), este **apresenta** (e aceita os dois).
 *
 * ## Por que não um mapeamento só, com um construtor esperto
 * Daria para declarar `User → ReaderView` e trocar a classe instanciada num `constructUsing` — as duas
 * views têm a mesma forma. E mentiria no lugar onde mais importa: o `__resolveType` decide pelo
 * `instanceof`, e um mapeamento que diz devolver `ReaderView` e às vezes devolve `AuthorView` é o tipo
 * de coisa que se descobre pelo cliente reclamando que `... on Author` parou de casar.
 */
@Injectable()
export class UserViewInterceptor implements NestInterceptor<User, UserView> {
  constructor(@InjectMapper() private readonly mapper: Mapper) {}

  intercept(_context: ExecutionContext, next: CallHandler<User>): Observable<UserView> {
    return next.handle().pipe(
      concatMap((user) =>
        user.canWritePosts()
          ? this.mapper.mapAsync(user, Author, AuthorView)
          : this.mapper.mapAsync(user as Reader, Reader, ReaderView),
      ),
    );
  }
}
