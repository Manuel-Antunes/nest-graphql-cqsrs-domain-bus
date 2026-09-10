import { Injectable, Logger } from '@nestjs/common';
import { EventPublisher } from '@nestjs/cqrs';
import { UnknownIdentityException } from '../../domain/user/exception/unknown-identity.exception';
import { type Identity, IdentityProvider } from '../../domain/user/identity.provider';
import { AUTHOR_ROLE, User } from '../../domain/user/user.entity';
import { Users } from '../../domain/user/user.factory';
import { UserRepository } from '../../domain/user/user.repository';
import type { CredentialId } from '../../domain/user/vo/credential-id';
import { UserId } from '../../domain/user/vo/user-id';

/**
 * Provisionamento *just-in-time* e ligação de contas — o `UserProvisioning` da versão Axon.
 *
 * Autenticar e **existir no domínio** são coisas diferentes. O provedor de identidade sabe quem
 * entrou; quem decide que perfil essa pessoa tem aqui é este serviço:
 *
 * 1. **não existe ninguém com esse email** → registra, e o papel decide a classe (`Reader`/`Author`);
 * 2. **existe** → é a mesma pessoa. O perfil que já está lá é reaproveitado, com o mesmo id, os
 *    mesmos posts e as mesmas subscriptions — trocar de origem de credencial não cria outra pessoa;
 * 3. **existe como `Reader` e o provedor diz `author`** → promove.
 *
 * ## O que ele recebe, e o que ele pergunta
 * Ele recebe **um id de credencial** — só isso. Quem é essa credencial (email, nome, papel) é uma
 * pergunta para o {@link IdentityProvider}, e é ele quem tem a resposta autoritativa. Antes esses
 * três campos chegavam prontos pela borda, o que dava duas fontes para o mesmo dado: o que estava no
 * cookie e o que estava no provedor. Agora há uma.
 *
 * Ele não conhece o Better Auth e não conhece o `EntityManager`: o que ele tem são portas — a da
 * identidade, do lado de fora, e o {@link UserRepository}, que continua sendo a fonte da verdade do
 * que é nosso. A separação importa porque as duas verdades mudam por motivos diferentes: o papel muda
 * no provedor, o perfil muda aqui. Este serviço é o lugar onde uma vira a outra — e o único.
 *
 * ## Conta é assunto do provedor
 * Não há entidade `Account` deste lado, e é de propósito. Ligar a credencial do Google à mesma
 * identidade de quem já tinha senha é o `account.accountLinking` do Better Auth (ver `authOptions`);
 * quando ele termina, o que chega aqui é **uma** identidade, com **um** email. Espelhar aquelas
 * linhas criaria uma segunda verdade para manter em sincronia — o mesmo motivo pelo qual não existe
 * um `PostEntity` ao lado do `Post`.
 *
 * ## Quem chama, e quando
 * O caminho normal é o **hook**: o Better Auth grava a credencial e o `UserProvisioningHooks` chama
 * `provision` ali mesmo, na requisição de sign-up — então o perfil existe antes da primeira query.
 * A borda continua chamando o mesmo método a cada requisição, e é por isso que ele é idempotente:
 * com o perfil já lá, provisionar é uma leitura. É também a retaguarda para uma identidade que tenha
 * nascido por um caminho que não passou pelo hook.
 */
@Injectable()
export class UserProvisioning {
  private readonly logger = new Logger(UserProvisioning.name);

  constructor(
    private readonly identities: IdentityProvider,
    private readonly users: UserRepository,
    private readonly publisher: EventPublisher,
  ) {}

  /**
   * O perfil de domínio de quem autenticou — criando, reaproveitando ou promovendo conforme o caso.
   * É idempotente: chamar de novo com a mesma credencial devolve o mesmo perfil sem escrever nada.
   *
   * @throws UnknownIdentityException se o provedor não conhecer mais a credencial
   */
  async provision(credentialId: CredentialId, now = new Date()): Promise<User> {
    const identity = await this.identities.findById(credentialId);
    if (!identity) {
      throw new UnknownIdentityException(credentialId);
    }

    const existing = await this.users.findActiveByEmail(identity.email);
    if (!existing) {
      return this.register(identity, now, await this.pendingPromotionId(identity));
    }
    if (identity.role === AUTHOR_ROLE && !existing.canWritePosts()) {
      return this.promote(existing, identity, now);
    }
    return existing;
  }

  /**
   * Completa uma promoção que morreu no meio. Um stream encerrado cujo sucessor não existe é a marca
   * de que o passo 2 não aconteceu — e o id do sucessor já está anotado no `supersededBy`, então
   * refazer o passo 2 com **aquele id** fecha a sequência sem duplicar ninguém.
   *
   * @returns o id a reusar na criação, ou `null` se não havia promoção pendente.
   */
  private async pendingPromotionId(identity: Identity): Promise<UserId | null> {
    const orphan = await this.users.findSupersededByEmail(identity.email);
    if (!orphan?.supersededBy) {
      return null;
    }
    if (await this.users.findById(orphan.supersededBy.id)) {
      return null;
    }
    this.logger.warn(
      `promoção interrompida detectada para ${identity.email}: retomando o id ${orphan.supersededBy.id}`,
    );
    return orphan.supersededBy.id;
  }

  private async register(identity: Identity, now: Date, resume: UserId | null): Promise<User> {
    const superseded = resume ? await this.users.findSupersededBy(resume) : null;
    const user = this.publisher.mergeObjectContext(
      Users.register(
        resume ?? UserId.generate(),
        { email: identity.email, name: identity.name },
        identity.role,
        now,
        superseded?.id ?? null,
      ),
    );
    await this.users.save(user);
    user.commit();
    return user;
  }

  /** Os dois passos da promoção, na mesma unidade de trabalho: encerra o antigo, abre o novo. */
  private async promote(reader: User, identity: Identity, now: Date): Promise<User> {
    const promotedId = UserId.generate();
    this.logger.log(`promovendo ${reader.email} de Reader para Author: ${reader.id} → ${promotedId}`);

    this.publisher.mergeObjectContext(reader).supersede(promotedId, now);
    const author = this.publisher.mergeObjectContext(
      Users.register(
        promotedId,
        { email: reader.email, name: identity.name },
        AUTHOR_ROLE,
        now,
        reader.id,
      ),
    );
    // Os dois na mesma transação: o `supersededBy` do reader aponta para o author, e a chave
    // estrangeira não aceitaria a referência antes de a linha existir. Ver `UserRepository.saveAll`.
    await this.users.saveAll([author, reader]);
    reader.commit();
    author.commit();
    return author;
  }
}
