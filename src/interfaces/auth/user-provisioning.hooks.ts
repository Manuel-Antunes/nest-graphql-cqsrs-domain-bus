import { MikroORM } from '@mikro-orm/core';
import { Injectable, Logger } from '@nestjs/common';
import { AfterCreate, AfterUpdate, DatabaseHook } from '@thallesp/nestjs-better-auth';
import { UserProvisioning } from '../../application/user/user-provisioning.service';
import { CredentialId } from '../../domain/user/vo/credential-id';
import { inRequestContext } from '../../infrastructure/persistence/request-context';

/** A linha de credencial que o Better Auth passa ao hook. */
interface AuthUserRow {
  id: string;
}

/**
 * A borda do **provedor de identidade**: onde o Better Auth chama para dentro.
 *
 * É a mesma natureza de um resolver — algo de fora invocando a aplicação —, e por isso mora em
 * `interfaces/` e não em `infrastructure/`. O que muda é o protocolo: em vez de uma query GraphQL,
 * o gatilho é uma linha gravada nas tabelas de autenticação.
 *
 * ## O que cada gancho responde
 * | Gancho | O fato | A consequência |
 * |---|---|---|
 * | `@AfterCreate('user')` | alguém se registrou | o perfil de domínio nasce **no sign-up** |
 * | `@AfterUpdate('user')` | a credencial mudou (o papel, entre outras coisas) | promove, se o papel agora pede |
 *
 * Não há gancho em `account`, e isso é o desenho: quem liga uma credencial nova à mesma identidade é
 * o `account.accountLinking` do próprio Better Auth (ver `authOptions`). Quando ele termina, a
 * identidade continua sendo uma — e o perfil dela já existe. Uma conta a mais não é um fato do nosso
 * domínio; é um caminho a mais para o mesmo login.
 *
 * ## Por que provisionar aqui, e não só na primeira requisição
 * Porque o fato aconteceu aqui. Enquanto o perfil nascia no `SessionUserPipe`, "existir no domínio"
 * era efeito colateral de ler um post — e uma pessoa registrada que nunca fez uma query simplesmente
 * não existia. Com o hook, registrar-se **é** o evento que a faz existir, e a borda do GraphQL volta
 * a ser só leitura (ver `SessionUserPipe`).
 *
 * ## Falhar aqui não derruba o login
 * O `catch` é deliberado: autenticar é do provedor, e provisionar é nosso. Se o nosso lado falha, a
 * credencial continua válida e a próxima requisição refaz o trabalho pelo caminho preguiçoso do pipe
 * — que é justamente a retaguarda que o desenho preserva. O que não pode acontecer é uma falha de
 * provisionamento virar um sign-up recusado.
 *
 * ## O contexto do ORM
 * Um hook roda dentro da requisição de `/api/auth/*`, que o middleware do `AuthModule` já embrulha em
 * `RequestContext.create` (ver `AppModule`). Mas nem todo caminho é HTTP — `IdentityProvider.grantRole`
 * chama o Better Auth de dentro do servidor —, então o {@link inRequestContext} reaproveita o contexto
 * quando há um e abre um quando não há. Sem isso, o `allowGlobalContext: false` do config estouraria no
 * primeiro repositório que o provisionamento tocasse.
 */
@Injectable()
@DatabaseHook()
export class UserProvisioningHooks {
  private readonly logger = new Logger(UserProvisioningHooks.name);

  constructor(
    private readonly orm: MikroORM,
    private readonly provisioning: UserProvisioning,
  ) {}

  /** Alguém se registrou: o perfil de domínio nasce agora, e não na primeira query. */
  @AfterCreate('user')
  async onCredentialCreated(user: AuthUserRow): Promise<void> {
    await this.provision(user.id, 'credencial criada');
  }

  /**
   * A credencial mudou. O que nos interessa é o **papel**: quem virou `author` no provedor precisa de
   * um `Author` aqui, e `provision` sabe quando isso significa promover e quando não significa nada.
   */
  @AfterUpdate('user')
  async onCredentialUpdated(user: AuthUserRow): Promise<void> {
    await this.provision(user.id, 'credencial atualizada');
  }

  private async provision(credentialId: string, because: string): Promise<void> {
    const parsed = CredentialId.safeParse(credentialId);
    if (!parsed.success) {
      this.logger.warn(`${because}: id de credencial inválido (${credentialId})`);
      return;
    }
    try {
      await inRequestContext(this.orm, () => this.provisioning.provision(parsed.data));
    } catch (error) {
      // Ver o javadoc da classe: o provisionamento é nosso, autenticar é dele. A próxima requisição
      // refaz isto pelo `SessionUserPipe`.
      this.logger.error(`${because}: provisionamento adiado para a próxima requisição`, error);
    }
  }
}
