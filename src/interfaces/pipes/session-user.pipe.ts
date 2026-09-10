import { Injectable, type PipeTransform } from '@nestjs/common';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { UserProvisioning } from '../../application/user/user-provisioning.service';
import { CredentialId } from '../../domain/user/vo/credential-id';
import type { User } from '../../domain/user/user.entity';

/**
 * Sessão do Better Auth → o perfil de **domínio** de quem está autenticado.
 *
 * O Better Auth diz *quem entrou*; quem diz *quem é essa pessoa aqui* é o `UserProvisioning`.
 *
 * ## O que o pipe entrega: um id, e não um retrato
 * Ele passa o **id da credencial** e recebe o perfil. Email, nome e papel não atravessam mais daqui:
 * quem os lê é o `IdentityProvider`, do outro lado da porta, e ele é a fonte autoritativa dos três.
 * Antes o pipe os copiava da sessão, o que dava duas versões do mesmo dado — a do cookie e a do
 * provedor.
 *
 * Numa requisição normal isto é uma leitura: quem cria o perfil é o hook de `user.create`, no
 * sign-up (ver `UserProvisioningHooks`), e `provision` é idempotente. O caminho preguiçoso continua
 * aqui como **retaguarda** — o hook é do provedor, e um provedor pode falhar; refazer o trabalho na
 * requisição seguinte dá o mesmo resultado.
 *
 * ## Por que um pipe, e não o corpo de um param decorator
 * Um `createParamDecorator` recebe só o `ExecutionContext`: ele não participa da injeção de
 * dependência, então não teria como alcançar o `UserProvisioning`. Um `PipeTransform` é um provider
 * como qualquer outro — e é o gancho que o Nest oferece para exatamente isto: transformar o valor de
 * um parâmetro com algo que precisa de DI.
 *
 * O `@CurrentUser()` é então o `@Session()` da lib **com este pipe pendurado**, e não um decorator
 * paralelo que reimplementa a leitura da sessão.
 *
 * ## Por que a entrada pode ser uma Promise
 * A factory do `@Session()` é `async`, e o Nest **não a resolve antes de aplicar os pipes**. No
 * `ExternalContextCreator`:
 *
 * ```js
 * const value = extractValue(...params);                       // não é awaited
 * args[index] = await this.getParamValue(value, …, pipes);      // e o getParamValue só devolve
 * ```                                                           // `value` quando NÃO há pipe
 *
 * Sem pipe, o `await` de fora resolve a Promise — que é por que `@Session()` sozinho sempre
 * funcionou. Com pipe, quem recebe a Promise é o **primeiro** pipe da cadeia. Do segundo em diante o
 * `PipesConsumer` já dá `await` entre um e outro, então só este precisa saber disso.
 */
@Injectable()
export class SessionUserPipe implements PipeTransform<UserSession | Promise<UserSession>, Promise<User>> {
  constructor(private readonly provisioning: UserProvisioning) {}

  async transform(maybeSession: UserSession | Promise<UserSession>): Promise<User> {
    const session = await maybeSession;
    const { id } = session.user as { id: string };
    return this.provisioning.provision(CredentialId.parse(id));
  }
}
