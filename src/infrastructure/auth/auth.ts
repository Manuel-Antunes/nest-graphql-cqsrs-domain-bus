import type { MikroORM } from '@mikro-orm/core';
import { mikroOrmAdapter } from 'better-auth-mikro-orm';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { admin, jwt } from 'better-auth/plugins';
import { oauthProvider } from '@better-auth/oauth-provider';
import { defineBetterAuthEntities } from './better-auth.schema';

/** O papel que autoriza escrita. Espelha o `ROLE_AUTHOR` do realm Keycloak da versão Axon. */
export const AUTHOR_ROLE = 'author';

/**
 * As opções do Better Auth — **sem** o `database`, porque elas servem a dois consumidores:
 *
 * 1. o {@link createAuth}, que as completa com o adapter do MikroORM;
 * 2. o {@link betterAuthEntities}, que deriva delas as tabelas a mapear.
 *
 * É a mesma sutileza do `CqsrsModule.forRootAsync` (uma factory, não duas): a lista de plugins é
 * declarada **uma vez**, e tanto o runtime quanto o schema saem dela. Ligar um plugin novo aqui faz
 * as tabelas dele aparecerem no ORM sozinhas.
 *
 * ## Os plugins, e por que cada um
 * - **`oauthProvider`**: é o que substitui o Keycloak da versão Java. Lá a aplicação era *resource
 *   server* e delegava a identidade; aqui ela **é** o authorization server — emite os próprios
 *   tokens, expõe `/oauth2/authorize`, `/oauth2/token`, `/oauth2/userinfo` e a descoberta OIDC em
 *   `/.well-known/openid-configuration`. Um provider a menos no docker-compose, e o fluxo OAuth2
 *   continua sendo OAuth2 de verdade;
 * - **`jwt`**: o `oauthProvider` assina id tokens e access tokens com as chaves que este plugin
 *   gerencia (tabela `jwks`). Sem ele não há o que assinar;
 * - **`admin`**: é quem dá o campo `user.role`. É por ele que `@Roles([AUTHOR_ROLE])` funciona, e é
 *   o papel que o `UserProvisioning` lê para decidir se o perfil nasce `Reader` ou `Author`.
 *
 * Os escopos `read:posts`/`write:posts` são o contrato de um cliente OAuth2 de terceiro: quem só tem
 * `read:posts` lê o feed, quem tem `write:posts` pode escrever — desde que o *usuário* por trás do
 * token também seja `author`. Escopo limita o que o cliente pode pedir; papel limita o que a pessoa
 * pode fazer. Os dois precisam bater.
 */
export const authOptions = {
  /**
   * O endereço público do authorization server. É ele que entra no `iss` dos tokens e na descoberta
   * OIDC, então em produção precisa ser o host de verdade — daí vir do ambiente. O padrão serve ao
   * desenvolvimento e aos testes, onde o servidor sobe em `localhost`.
   */
  baseURL: process.env.AUTH_URL ?? `http://localhost:${process.env.PORT ?? 3000}`,
  /** A chave que assina sessões. Em produção vem do ambiente; o padrão é só para POC e teste. */
  secret: process.env.AUTH_SECRET ?? 'nest-graphql-posts-dev-secret-nao-use-em-producao',
  /**
   * A tabela `user` do Better Auth é renomeada para `authUser` — e não é preferência estética: sem
   * isso ela colidiria com o agregado `User` do domínio, que o MikroORM registra sob esse mesmo nome.
   * São coisas diferentes e é bom que os nomes digam isso: `authUser` é **credencial** (quem provou
   * ser quem diz), `User` é **perfil** (quem essa pessoa é neste domínio, `Reader` ou `Author`). Quem
   * liga um ao outro, pelo email, é o `UserProvisioning`.
   */
  user: { modelName: 'authUser' },
  emailAndPassword: { enabled: true },
  /**
   * **Ligação de contas é dele.** Uma pessoa que entrou com email e senha e volta pelo Google é a
   * mesma pessoa: com isto ligado, o Better Auth prende a segunda credencial à identidade que já
   * existe, em vez de abrir outra — e o `UserProvisioning` continua vendo *uma* identidade, com *um*
   * email.
   *
   * É por isso que não existe uma entidade `Account` deste lado. O domínio tem uma pergunta a fazer
   * ("de quem é este perfil?") e ela é respondida pelo email da identidade já resolvida; espelhar a
   * tabela `account` daqui seria manter uma segunda verdade em sincronia com esta, sem ganhar
   * resposta nenhuma que já não estivesse aqui.
   *
   * `credential` entra em `trustedProviders` porque é o provedor de email e senha desta POC — o
   * email dele é o que o próprio servidor verificou.
   */
  account: {
    accountLinking: { enabled: true, trustedProviders: ['credential'] },
  },
  /**
   * O objeto precisa **existir** aqui, ainda que vazio.
   *
   * Os `@DatabaseHook()` do @thallesp/nestjs-better-auth não substituem esta configuração: eles a
   * *decoram*. O `setupDatabaseHooks` da lib começa com `if (!auth.options.databaseHooks) return`,
   * e então encadeia cada método descoberto sobre o que já estivesse pendurado. Sem esta linha, os
   * hooks do `UserProvisioningHooks` seriam registrados como providers, descobertos, e silenciosamente
   * nunca chamados — que é o pior modo de uma integração falhar.
   */
  databaseHooks: {},
  plugins: [
    jwt(),
    admin(),
    /**
     * O cast existe por um defeito de empacotamento do upstream, não por conveniência.
     *
     * `better-auth@1.7.3` fixa `@better-auth/utils@0.4.2`; `better-call@1.4.0`, que o
     * `@better-auth/oauth-provider` traz como peer, pede `^0.5.0`. Como `@better-auth/core` depende
     * de `utils` por *peer*, o pnpm instala **duas instâncias de `@better-auth/core@1.7.3`** — uma
     * por resolução — e os tipos `BetterAuthPlugin` das duas ficam estruturalmente incompatíveis,
     * ainda que idênticos. Um `pnpm.overrides` não colapsa isso: a duplicata vem do contexto de peer,
     * não da versão.
     *
     * O runtime é o mesmo objeto e funciona: o smoke sobe o ORM, registra um usuário, autentica e
     * grava `user`, `account` e `session`. Quando o upstream alinhar as duas faixas, o cast sai —
     * e o `pnpm.overrides` de `@better-auth/utils` no `package.json` sai junto.
     */
    oauthProvider({
      loginPage: '/sign-in',
      consentPage: '/consent',
      scopes: ['openid', 'profile', 'email', 'offline_access', 'read:posts', 'write:posts'],
    }) as unknown as NonNullable<BetterAuthOptions['plugins']>[number],
  ],
} satisfies BetterAuthOptions;

/**
 * As entidades das tabelas de autenticação, derivadas das opções acima. Entram no `entities` do
 * MikroORM ao lado de `PostSchema` e `TagSchema` — ver `mikroOrmConfig`.
 */
export const betterAuthEntities = defineBetterAuthEntities(authOptions);

/**
 * A instância do Better Auth ligada ao MikroORM.
 *
 * Uma função, e não uma constante, porque o adapter precisa do `MikroORM` já inicializado — que no
 * Nest só existe depois que o `MikroOrmModule` subiu. Quem a chama é o `AuthModule` da aplicação.
 *
 * `generateId` fica no padrão (ligado): o `id` das tabelas de auth é uma coluna string sem
 * autoincremento, então quem o gera é o Better Auth, não o ORM.
 */
export function createAuth(orm: MikroORM) {
  return betterAuth({ ...authOptions, database: mikroOrmAdapter(orm) });
}

export type Auth = ReturnType<typeof createAuth>;
