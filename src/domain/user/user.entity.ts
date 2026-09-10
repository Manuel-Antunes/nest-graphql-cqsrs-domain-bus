import { BaseEntity, ref, rel, type Ref } from "@mikro-orm/core";
import { WithAggregateRoot } from "@nestjs/cqrs";
import { WithSoftDelete } from "../shared/soft-delete";
import type { Author } from "./author.entity";
import { UserDeletedEvent } from "./event/user-deleted.event";
import { UserRegisteredEvent } from "./event/user-registered.event";
import { UserRestoredEvent } from "./event/user-restored.event";
import { UserSupersededEvent } from "./event/user-superseded.event";
import { InvalidUserException } from "./exception/invalid-user.exception";
import { Email } from "./vo/email";
import { UserId } from "./vo/user-id";
import { UserName } from "./vo/user-name";

/** Os eventos que um User dispara. */
export type UserEvent =
  | UserRegisteredEvent
  | UserSupersededEvent
  | UserDeletedEvent
  | UserRestoredEvent;

/** O papel que autoriza escrita — o `ROLE_AUTHOR` do realm Keycloak da versão Axon. */
export const AUTHOR_ROLE = "author";

/** O que é preciso para nascer um User: os dois value objects, validados juntos. */

/**
 * O User: **agregado polimórfico**, abstrato, com dois tipos concretos — {@link Reader} e
 * {@link Author}. É a peça que a versão Axon declarava como
 * `@EventSourced(concreteTypes = {Reader, Author})` com herança JPA `JOINED`.
 *
 * ## Por que dois tipos, e não um campo `role`
 * Um `Reader` **não** escreve posts. Isso não é uma checagem que roda em runtime: é o tipo. Não existe
 * `Reader.writePost`, então nenhum caminho do código consegue chegar lá — e nenhum `posts.author_id`
 * jamais aponta para um Reader. O papel vive no Better Auth (é `user.role`, do plugin `admin`) e diz
 * *quem pode virar o quê*; o tipo vive aqui e diz *o que já é*.
 *
 * ## Herança multi-tabela (`inheritance: 'tpt'`)
 * `users` guarda o que todo User tem; `readers` e `authors` guardam o resto, cada um com a sua linha
 * ligada por chave primária. É o `JOINED` do JPA, e a escolha tem a mesma consequência boa: **não há
 * coluna discriminadora** — quem decide o tipo é a existência da linha filha. Um `em.find(User, {})`
 * volta com as instâncias concretas certas.
 *
 * ## Promover é encerrar um stream e abrir outro
 * Um `Reader` não vira `Author`: a classe de um agregado é decidida pelo primeiro evento do stream, e
 * um evento já gravado não muda de ideia. Promover é, então, uma sequência:
 *
 * 1. `reader.supersede(novoId, agora)` → `UserSupersededEvent` encerra o stream antigo;
 * 2. `Users.register(novoId, ..., role: 'author', supersedes: idAntigo)` abre o novo;
 * 3. a credencial é religada ao novo perfil.
 *
 * O email não colide entre os dois porque o índice único é **parcial** — só vale entre ativos
 * (`where superseded_by is null and deleted_at is null`). E se o processo morrer entre 1 e 2, o
 * próximo login detecta o stream órfão e completa a sequência: ver `UserProvisioning`.
 *
 * ## Apagar é reversível
 * `softDelete` marca `deletedAt` e a linha fica. O efeito que importa é indireto: os posts
 * referenciam o autor, e o filtro de ativos vale para os dois lados — some o autor, somem os posts
 * das consultas, sem tocar em nenhuma linha de post.
 */
export abstract class User extends WithAggregateRoot(
  WithSoftDelete(BaseEntity),
)<UserEvent> {
  id!: UserId;
  email!: Email;
  name!: UserName;
  createdAt!: Date;
  /** Quantos eventos já foram aplicados. Não é lock otimista do ORM: é o contador do stream. */
  version!: number;
  /** Preenchido quando este stream foi encerrado em favor de outro (promoção). */
  supersededBy?: Ref<User> | null;
  /** Preenchido quando este stream nasceu de uma promoção; aponta para o que foi encerrado. */
  supersedes?: Ref<User> | null;

  // ---- decidir --------------------------------------------------------------------------------

  /**
   * Uma referência a **outro** User, a partir do id — o que os eventos carregam.
   *
   * `rel` monta a referência sem ir ao banco, e sem saber o tipo concreto: a herança é multi-tabela e
   * a coluna guarda só o id, então quem resolve `Reader` ou `Author` é o ORM na hora de carregar. É o
   * mesmo papel do `Author.reference(id)` da versão Java, e a razão de `supersededBy`/`supersedes`
   * serem `Ref<User>` e não `UserId`: um relacionamento é um relacionamento, e quem o carrega é quem
   * precisa dele.
   */
  static referenceTo(userId: UserId): Ref<User> {
    // O cast existe porque `rel` pede um construtor concreto, e a raiz da herança é abstrata de
    // propósito — só o ORM sabe se aquela linha é `Reader` ou `Author`, e é ele quem resolve.
    return ref(rel(User as unknown as new () => User, userId)) as Ref<User>;
  }
  /** A instância vazia da classe que aquele papel pede. */
  /**
   * Encerra este stream em favor de outro — o primeiro passo de uma promoção.
   *
   * @throws InvalidUserException se o stream já estiver encerrado, ou se apontar para si mesmo
   */
  supersede(by: UserId, now: Date): this {
    if (this.supersededBy) {
      throw new InvalidUserException(
        `user ${this.id} já foi encerrado em favor de ${this.supersededBy.id}`,
      );
    }
    if (by.equals(this.id)) {
      throw new InvalidUserException("um user não pode suceder a si mesmo");
    }
    this.apply(new UserSupersededEvent(this.id.value, by.value, now));
    return this;
  }

  /** @throws InvalidUserException se já estiver apagado */
  override softDelete(now: Date): this {
    super.softDelete(now);
    this.apply(new UserDeletedEvent(this.id.value, now));
    return this;
  }

  /** @throws InvalidUserException se não estiver apagado */
  override restore(now: Date): this {
    super.restore(now);
    this.apply(new UserRestoredEvent(this.id.value, now));
    return this;
  }

  // ---- perguntas que a autorização faz --------------------------------------------------------

  /** Só um {@link Author} escreve. É o tipo que responde, não um campo. */
  /**
   * Só um {@link Author} escreve. É o **tipo** que responde, não um campo.
   *
   * A resposta é dada pela subclasse (`Author` devolve `true`), e não por um `instanceof` aqui: é o
   * que mantém o `User` sem conhecer os tipos concretos — ver `Users`, em `user.factory`.
   */
  canWritePosts(): this is Author {
    return false;
  }

  /** Um stream encerrado ou apagado não age. */
  isActive(): boolean {
    return !this.supersededBy && !this.isDeleted();
  }

  // ---- evoluir --------------------------------------------------------------------------------

  onUserRegisteredEvent(event: UserRegisteredEvent): void {
    this.id = UserId.parse(event.userId);
    this.email = Email.parse(event.email);
    this.name = UserName.parse(event.name);
    this.createdAt = event.occurredAt;
    this.supersedes = event.supersedes
      ? User.referenceTo(UserId.parse(event.supersedes))
      : null;
    this.supersededBy = null;
    this.applyRestoration();
    this.version = 1;
  }

  onUserSupersededEvent(event: UserSupersededEvent): void {
    this.supersededBy = User.referenceTo(UserId.parse(event.supersededBy));
    this.version += 1;
  }

  onUserDeletedEvent(event: UserDeletedEvent): void {
    this.applyDeletion(event.occurredAt);
    this.version += 1;
  }

  onUserRestoredEvent(_event: UserRestoredEvent): void {
    this.applyRestoration();
    this.version += 1;
  }
}
