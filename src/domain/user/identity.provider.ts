import type { Email } from './vo/email';
import type { CredentialId } from './vo/credential-id';
import type { UserName } from './vo/user-name';

/**
 * Quem autenticou, como o provedor de identidade o descreve. É o retrato que atravessa a porta —
 * value objects deste domínio, e nenhum tipo do Better Auth.
 */
export interface Identity {
  readonly credentialId: CredentialId;
  readonly email: Email;
  readonly name: UserName;
  /** O papel que o provedor atribui. `null` quando ele não atribui nenhum. */
  readonly role: string | null;
}

/**
 * Porta do **provedor de identidade** — o lado de fora da autenticação, como o domínio precisa dele.
 *
 * ## Por que ela existe
 * O provisionamento precisa fazer duas perguntas que não são do banco: *quem é o dono deste id de
 * sessão?* e *este papel mudou?*. Sem esta porta, respondê-las é chamar o Better Auth — e aí a camada
 * de aplicação passa a importar `better-auth`, que é precisamente o acoplamento que a arquitetura
 * evita em todo o resto do projeto.
 *
 * Com ela, o adapter é a **única** peça que sabe o nome do provedor:
 * {@link BetterAuthIdentityProvider}, em `infrastructure/auth`. Trocar o Better Auth por Keycloak (que
 * é de onde este projeto veio) é escrever outro adapter e mudar uma linha de módulo. Nada em
 * `application/` muda, e os testes do provisionamento nem sequer sabem que o Better Auth existe.
 *
 * ## O que ela deliberadamente não tem
 * **Conta.** Uma pessoa pode entrar por email e senha hoje e pelo Google amanhã, e ligar as duas à
 * mesma identidade é trabalho do provedor — o Better Auth faz isso pelo `account.accountLinking`
 * (ver `authOptions`). Espelhar aquelas linhas aqui criaria uma segunda verdade para manter em
 * sincronia, que é o mesmo motivo pelo qual não existe um `PostEntity` ao lado do `Post`.
 *
 * O que sobra para este lado é a única pergunta que é nossa: **de quem é este perfil**. A separação
 * entre *user* e *account* continua existindo — ela só mora inteira do lado de lá, e o que atravessa
 * a fronteira é a {@link Identity} já resolvida.
 *
 * Também não emite sessão, não valida senha e não assina token: isso é do provedor, e é o que ele faz
 * melhor que nós.
 *
 * `grantRole` é a única escrita, e ela é deliberada: o papel mora no provedor (é o `user.role` do
 * plugin `admin`), então promover alguém é dizer *lá* que o papel mudou — e deixar o hook de
 * `user.update` trazer a consequência para cá. Ver `UserProvisioningHooks`.
 */
export abstract class IdentityProvider {
  /** A identidade por trás de um id de credencial — `null` se ela não existe (mais). */
  abstract findById(credentialId: CredentialId): Promise<Identity | null>;

  /**
   * Concede um papel à identidade, **no provedor**. Devolve o retrato já atualizado.
   *
   * É a operação que o teste e o operador usam para promover alguém a autor; a consequência de
   * domínio (encerrar o stream do Reader e abrir o do Author) chega por hook, e não por esta chamada.
   */
  abstract grantRole(credentialId: CredentialId, role: string): Promise<Identity>;
}
