import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { inRequestContext } from '../../request-context';
import { User } from '../../../../domain/user/user.entity';
import { UserRepository } from '../../../../domain/user/user.repository';
import type { Email } from '../../../../domain/user/vo/email';
import type { UserId } from '../../../../domain/user/vo/user-id';
import { ACTIVE_FILTER } from '../entities/soft-delete-orm.entity';

/**
 * Adapter da porta `UserRepository` sobre o MikroORM.
 *
 * As consultas apontam para `User`, a **base abstrata** da herança multi-tabela: o ORM junta as
 * tabelas filhas e devolve `Reader` ou `Author` já com o tipo concreto certo — não há discriminador
 * a inspecionar aqui.
 */
@Injectable()
export class MikroOrmUserRepository extends UserRepository {
  constructor(private readonly em: EntityManager) {
    super();
  }

  async save(user: User): Promise<void> {
    await this.em.persist(user).flush();
  }

  /** Um `persist` de cada, **um** `flush` — é o flush que é a transação. */
  async saveAll(users: readonly User[]): Promise<void> {
    await this.em.persist([...users]).flush();
  }

  /**
   * Envolvido em {@link inRequestContext} porque este é um dos dois métodos que uma **subscription**
   * alcança: `Post.author` é resolvido a partir do `authorId` da view, e a view de `onPostCreated`
   * nasce dentro de um WebSocket — fora do middleware do Express, e portanto fora de qualquer contexto
   * do ORM. Sem isto, a consulta é recusada por `allowGlobalContext: false`.
   *
   * Numa requisição HTTP o envelope é **inerte**: havendo contexto, o trabalho entra nele, então o
   * identity map continua o da requisição — é o que faz o `Post.author` de uma leitura custar zero
   * consultas, porque o autor já veio populado junto do post.
   *
   * Qualquer leitura nova que um resolver de campo possa alcançar precisa do mesmo envelope. São duas
   * hoje: esta e `MikroOrmPostRepository.findByAuthor`.
   */
  findById(userId: UserId): Promise<User | null> {
    return inRequestContext(this.em, () => this.em.findOne(User, { id: userId }));
  }

  /** O mesmo recorte do índice único parcial: ativo é quem não foi encerrado nem apagado. */
  /**
   * O `deletedAt: null` que estava aqui sumiu: quem o aplica agora é o filtro `active`, ligado por
   * padrão no schema do User. O que sobra é o que **este** repositório precisa dizer a mais — que um
   * stream encerrado por promoção também não conta.
   */
  findActiveByEmail(email: Email): Promise<User | null> {
    return this.em.findOne(User, { email, supersededBy: null });
  }

  /** Ver `MikroOrmPostRepository.restore`: uma escrita por fora do filtro. */
  async restore(userId: UserId): Promise<void> {
    await this.em.nativeUpdate(
      User,
      { id: userId },
      { deleted: { deletedAt: null } },
      { filters: { [ACTIVE_FILTER]: false } },
    );
  }

  findSupersededBy(userId: UserId): Promise<User | null> {
    return this.em.findOne(User, { supersededBy: userId });
  }

  /** O mais recente primeiro: uma pessoa pode ter sido promovida mais de uma vez. */
  findSupersededByEmail(email: Email): Promise<User | null> {
    return this.em.findOne(
      User,
      { email, supersededBy: { $ne: null } },
      { orderBy: { createdAt: 'desc' } },
    );
  }
}
