import { MikroORM } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { inRequestContext } from '../persistence/request-context';
import { type Identity, IdentityProvider } from '../../domain/user/identity.provider';
import { Email } from '../../domain/user/vo/email';
import { CredentialId } from '../../domain/user/vo/credential-id';
import { UserName } from '../../domain/user/vo/user-name';

/** A linha de credencial como o Better Auth a devolve — o que atravessa a fronteira e para aqui. */
interface AuthUserRow {
  id: string;
  email: string;
  name: string;
  role?: string | string[] | null;
}

/**
 * O adapter da porta {@link IdentityProvider} sobre o Better Auth — **a única peça do projeto que
 * fala com ele para responder perguntas do domínio**.
 *
 * ## Por que o `internalAdapter`, e não o `auth.api`
 * O `auth.api` é a superfície **HTTP** do Better Auth: cada endpoint dele espera uma requisição, e os
 * de administração (`setRole`, por exemplo) exigem uma sessão de admin para autorizar. Aqui não há
 * requisição nem admin: quem chama é o servidor, sobre si mesmo, e a autorização já aconteceu.
 *
 * `auth.$context` é a porta de trás oficial para isso: dá o `internalAdapter`, que é a mesma camada
 * que os endpoints usam por dentro. E ela é a escolha certa por um motivo que não é conveniência —
 * `internalAdapter.updateUser` passa pelo `updateWithHooks`, então conceder um papel por aqui
 * **dispara o hook de `user.update`**, e a consequência de domínio (promover o perfil) chega pelo
 * mesmo caminho por onde chegaria se o papel tivesse mudado pela API. Um caminho só, testado uma vez.
 *
 * ## O que ele traduz
 * Linha do Better Auth → value objects do domínio, e nada mais. Um `role` que venha como lista (o
 * plugin `admin` permite vários papéis) é achatado para o primeiro — o domínio pergunta *um* papel,
 * e é a fronteira que resolve a diferença de forma, não o `Users.register`.
 *
 * ## O que ele não traduz: conta
 * Ligar a credencial do Google à mesma identidade de quem já tinha senha é trabalho do
 * `account.accountLinking` do próprio Better Auth (ver `authOptions`). Quando ele termina, o que
 * existe é **uma** identidade — e é ela que sai por aqui. Nenhuma linha da tabela `account` precisa
 * atravessar a fronteira para o provisionamento decidir de quem é o perfil.
 */
@Injectable()
export class BetterAuthIdentityProvider extends IdentityProvider {
  private readonly logger = new Logger(BetterAuthIdentityProvider.name);

  constructor(
    private readonly auth: AuthService,
    private readonly orm: MikroORM,
  ) {
    super();
  }

  async findById(credentialId: CredentialId): Promise<Identity | null> {
    const user = await this.onIdentityStore<AuthUserRow | null>((adapter) =>
      adapter.findUserById(credentialId.value),
    );
    return user ? BetterAuthIdentityProvider.toIdentity(user) : null;
  }

  /**
   * Concede o papel **no provedor**. O `updateUser` passa pelos hooks do Better Auth, então o
   * `@AfterUpdate('user')` do provisionamento roda em seguida e traz a promoção para o domínio.
   */
  async grantRole(credentialId: CredentialId, role: string): Promise<Identity> {
    this.logger.log(`concedendo o papel ${role} à credencial ${credentialId}`);
    const updated = await this.onIdentityStore<AuthUserRow>((adapter) =>
      adapter.updateUser(credentialId.value, { role }),
    );
    return BetterAuthIdentityProvider.toIdentity(updated);
  }

  /**
   * Uma chamada ao armazenamento de identidades do Better Auth, com as duas coisas que toda chamada
   * daqui precisa.
   *
   * A primeira é o `internalAdapter`: o contexto do Better Auth é uma promessa que ele resolve uma
   * vez e memoiza, então pedi-la a cada chamada não recria nada — e evita guardar aqui um estado que
   * o `AuthService` já guarda melhor.
   *
   * A segunda é o **contexto do ORM**. As tabelas de autenticação são as mesmas do domínio, e quem
   * as consulta é o `mikroOrmAdapter` do Better Auth: uma chamada nascida fora de uma requisição
   * HTTP (um teste, um seed, o servidor falando consigo mesmo) encontraria o EntityManager global e
   * seria recusada por `allowGlobalContext: false`. Abrir o contexto é responsabilidade desta borda,
   * e não de quem chama a porta — ver {@link inRequestContext}.
   */
  private onIdentityStore<T>(work: (adapter: any) => Promise<unknown>): Promise<T> {
    return inRequestContext(this.orm, async () => {
      const context = await (this.auth.instance as { $context: Promise<any> }).$context;
      return (await work(context.internalAdapter)) as T;
    });
  }

  private static toIdentity(user: AuthUserRow): Identity {
    return {
      credentialId: CredentialId.parse(user.id),
      email: Email.parse(user.email),
      name: UserName.parse(user.name),
      role: BetterAuthIdentityProvider.firstRole(user.role),
    };
  }

  /** O plugin `admin` aceita vários papéis; o domínio pergunta um. */
  private static firstRole(role: AuthUserRow['role']): string | null {
    if (Array.isArray(role)) {
      return role[0] ?? null;
    }
    return role ?? null;
  }
}
