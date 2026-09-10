import { BaseEntity, Collection, ref, rel, type Ref } from "@mikro-orm/core";
import { WithAggregateRoot } from "@nestjs/cqrs";
import { z } from "zod";
import { WithSoftDelete } from "../shared/soft-delete";
import { Tag } from "../tag/tag.entity";
import { TagId } from "../tag/vo/tag-id";
import { Author } from "../user/author.entity";
import { type User } from "../user/user.entity";
import { UserId } from "../user/vo/user-id";
import type { UserName } from "../user/vo/user-name";
import { PostCreatedEvent } from "./event/post-created.event";
import { PostDeletedEvent } from "./event/post-deleted.event";
import { PostRestoredEvent } from "./event/post-restored.event";
import { PostUpdatedEvent } from "./event/post-updated.event";
import { InvalidPostException } from "./exception/invalid-post.exception";
import { PostNotWrittenByException } from "./exception/post-not-written-by.exception";
import { PostContent } from "./vo/post-content";
import { PostId } from "./vo/post-id";
import { PostTitle } from "./vo/post-title";

/** Os eventos que um Post dispara — o tipo que `apply`/`getUncommittedEvents` conhecem. */
export type PostEvent =
  | PostCreatedEvent
  | PostUpdatedEvent
  | PostDeletedEvent
  | PostRestoredEvent;

/**
 * O que é preciso para nascer um Post: os dois value objects de texto. O autor é um agregado.
 *
 * `PostTitle.field()` é o value object **embutido**: o schema aceita texto na entrada e devolve a
 * classe na saída, então `parsed.data.title` já é um `PostTitle` — não um `string` esperando por um
 * segundo `parse`.
 */
const NewPost = z.object({
  title: PostTitle.field(),
  content: PostContent.field(),
});
export type NewPost = z.input<typeof NewPost>;

/** O que um update parcial pode trazer: `null`/ausente significa "manter o valor atual". */
const PostChanges = z.object({
  title: PostTitle.field().nullish(),
  content: PostContent.field().nullish(),
});
export type PostChanges = z.input<typeof PostChanges>;

/**
 * O Post: a entidade de domínio **e** o aggregate root do @nestjs/cqrs, numa classe só.
 *
 * O mapeamento do ORM ficou de fora: ele mora em `infrastructure/persistence/sqlite/entities/post-orm.entity`,
 * que é onde as decisões de deploy moram — qual coluna, de que tipo, com que índice. Continua **não**
 * existindo um "PostEntity" espelho para manter em sincronia: o `defineEntity` de lá aponta para
 * *esta* classe (`{ class: Post }`), e o que se separou foi a camada, não o objeto.
 *
 * ## Decidir e evoluir
 * **Decidir** (`create`, `update`, `assignTag`) valida as invariantes, monta o evento com o estado
 * resultante e chama `apply(evento)`. **Evoluir** (`onPostCreatedEvent`, `onPostUpdatedEvent`) aplica
 * o evento ao estado — é o `apply` do aggregate root que os chama, pelo nome `on<Evento>`. Decidir
 * termina chamando evoluir, então "o que o command salvou" e "o que sai de um replay
 * (`loadFromHistory`)" não podem divergir.
 *
 * ## Mutável, e por quê
 * O ORM gerencia a instância e precisa escrever nela ao hidratar; os handlers `on...` então **mutam**
 * o estado. A entidade continua sem setters: só eventos mudam o estado, e só decisões produzem eventos.
 * Os handlers são idempotentes porque cada campo do evento é um valor absoluto (versão inclusive).
 *
 * ## `forceConstructor`
 * O MikroORM hidrata entidades por `Object.create(prototype)`, sem chamar o construtor — e é no
 * construtor que o mixin `WithAggregateRoot` inicializa a lista de eventos não-commitados **e que a
 * `Collection` de tags é criada**. Com `forceConstructor: true` no schema, um Post que volta do banco
 * nasce pelo `new` e chega inteiro.
 */
export class Post extends WithAggregateRoot(
  WithSoftDelete(BaseEntity),
)<PostEvent> {
  id!: PostId;
  title!: PostTitle;
  content!: PostContent;
  /**
   * Quem escreveu — o agregado {@link User}, por **referência**, e não por cópia do nome.
   *
   * É o `@ManyToOne(optional = false) User author` da versão Axon. `Ref<User>` é a referência do
   * MikroORM: a coluna guarda só o id, e o objeto é materializado quando alguém pede
   * (`populate: ['author']`, que é o que o `MikroOrmPostRepository` faz). Como `User` é a base
   * abstrata de uma herança multi-tabela, o que volta é o **tipo concreto** — `Author` ou `Reader`.
   *
   * A consequência boa é a mesma do soft delete de User: some o autor das consultas, somem os posts
   * dele junto, sem que nenhuma linha de post seja tocada.
   */
  author!: Ref<Author>;
  createdAt!: Date;
  updatedAt!: Date;
  /** Quantos eventos já foram aplicados (1 = só criado). Não é lock otimista do ORM: é o contador do stream. */
  version!: number;
  /**
   * As tags do post, como **relação** many-to-many de verdade (tabela pivô `post_tags`) — o agregado
   * `Tag` em pessoa, não uma cópia de id + nome.
   *
   * O preço de ter o objeto e não a cópia: um Post só sabe o *nome* das suas tags quando a coleção
   * está carregada. Quem lê um Post para exibir ou para decidir um update precisa pedi-la populada —
   * é o que o `MikroOrmPostRepository` faz (`populate: ['tags']`), e é a razão do
   * `dataloader: DataloaderType.ALL` na configuração: o caminho preguiçoso (um `loadItems()` por
   * post) vira uma consulta só por rodada, em vez de N.
   */
  readonly tags = new Collection<Tag, Post>(this);

  // ---- decidir: valida, dispara o evento e devolve o estado resultante ------------------------

  /**
   * Construtor nomeado do Post: valida os dados, **dispara** `PostCreatedEvent` e devolve o Post já
   * criado, pronto para ser salvo por quem chamou. Nasce sem tags.
   *
   * ## Recebe uma referência, não o agregado carregado
   * O Post referencia o autor por **identidade**, e nunca precisou de mais: ele compara ids e grava
   * `posts.author_id`. Exigir a entidade carregada obrigava o command handler a ler o agregado `User`
   * antes de decidir — um agregado consultando outro, que é justamente o que a fronteira existe para
   * evitar. Quem garante que o id existe **e é de um autor** é a chave estrangeira, que aponta para
   * `authors` e não para `users`; e ela garante melhor do que a consulta garantia, porque um SELECT
   * antes do INSERT tem uma janela em que o autor pode sumir, e a FK não tem.
   *
   * O `authorName` vem junto porque é o **retrato** que o evento registra: o nome como era no instante
   * do fato. Ele vem da borda, que já carregou o autor para autorizar; a referência continua sem
   * precisar ser carregada.
   *
   * Ele existia para a subscription montar a `PostView` sem tocar o banco, e hoje **ninguém o lê**: o
   * `Post.author` do protocolo é um `type Author`, resolvido pelo id (ver `PostAuthorResolver`), e quem
   * reconstitui o agregado usa só o `authorId`. Fica no payload porque é isso que um evento é — um fato
   * gravado, e um fato não se reescreve por ter deixado de ser consultado. Tirá-lo é uma decisão à
   * parte, e a pergunta que ela faz é se este sistema quer poder dizer "o nome na época", que é
   * exatamente o que um `authorId` sozinho não diz.
   *
   * O autor não vem no input: vem de quem despachou o command — que por sua vez o tirou da sessão,
   * nunca do corpo da requisição. É o que impede alguém escrever em nome de outro.
   *
   * @throws InvalidPostException se title ou content violarem suas invariantes
   */
  static create(
    id: PostId,
    input: NewPost,
    author: Ref<Author>,
    authorName: UserName,
    now: Date,
  ): Post {
    const parsed = NewPost.safeParse(input);
    if (!parsed.success) {
      throw InvalidPostException.fromZod(parsed.error);
    }
    const post = new Post();
    post.author = author;
    post.apply(
      new PostCreatedEvent(
        id.value,
        parsed.data.title.value,
        parsed.data.content.value,
        author.id.value,
        authorName.value,
        now,
      ),
    );
    return post;
  }

  /**
   * Decide uma atualização parcial de título e/ou conteúdo, dispara `PostUpdatedEvent` com o estado
   * resultante e devolve o Post atualizado. Campos `null`/ausentes significam "não mexer"; as tags
   * não mudam aqui.
   *
   * @throws InvalidPostException se um valor informado for inválido, ou se nada mudar
   */
  update(changes: PostChanges, now: Date): this {
    const parsed = PostChanges.safeParse(changes);
    if (!parsed.success) {
      throw InvalidPostException.fromZod(parsed.error);
    }
    const title = parsed.data.title ?? this.title;
    const content = parsed.data.content ?? this.content;
    if (title.equals(this.title) && content.equals(this.content)) {
      throw new InvalidPostException(
        "update sem mudanças: informe um title e/ou content diferente do atual",
      );
    }
    return this.raiseUpdate(title, content, this.loadedTags(), now);
  }

  /**
   * Assinala uma tag ao post e dispara `PostUpdatedEvent` com a lista de tags resultante — o mesmo
   * evento de update, porque a tag faz parte do estado do post, não de um ciclo de vida à parte.
   *
   * Recebe o agregado `Tag` inteiro, e não uma cópia: é dele que sai o nome que vai no evento.
   *
   * O `add` antes do `raiseUpdate` é o que entrega o objeto ao evoluir — ver `onPostUpdatedEvent`.
   * Não é ele que decide a participação da tag (o evento decide, e o evoluir a aplica); ele só põe a
   * Tag ao alcance, na própria coleção, que é onde objetos de tag moram.
   *
   * @throws InvalidPostException se o post já tiver essa tag
   */
  assignTag(tag: Tag, now: Date): this {
    if (this.hasTag(tag.id)) {
      throw new InvalidPostException(`post já tem a tag ${tag.name}`);
    }
    this.tags.add(tag);
    return this.raiseUpdate(this.title, this.content, this.loadedTags(), now);
  }

  /**
   * Apaga o post de forma reversível: a linha fica, o `deletedAt` marca, e o filtro de ativos o tira
   * das consultas.
   *
   * @throws InvalidPostException se já estiver apagado
   */
  override softDelete(now: Date): this {
    // O `super` é a decisão do mixin — a guarda roda antes de existir evento, que é a ordem certa.
    // O que este override acrescenta é o que só o agregado sabe fazer: registrar o fato.
    super.softDelete(now);
    this.apply(new PostDeletedEvent(this.id.value, this.version + 1, now));
    return this;
  }

  /** @throws InvalidPostException se não estiver apagado */
  override restore(now: Date): this {
    super.restore(now);
    this.apply(new PostRestoredEvent(this.id.value, this.version + 1, now));
    return this;
  }

  /**
   * A invariante de propriedade: **só quem escreveu mexe**.
   *
   * Mora no agregado, e não só na borda, porque é regra do Post — vale para qualquer caminho que
   * chegue até ele. A guarda de borda responde "esta pessoa pode escrever posts?" (papel); esta
   * responde "pode escrever *este*?" (propriedade). As duas precisam passar.
   *
   * @throws PostNotWrittenByException se o user não for o autor
   */
  assertWrittenBy(user: User): this {
    if (!this.author.id.equals(user.id)) {
      throw new PostNotWrittenByException(this.id, user.id);
    }
    return this;
  }

  /** O nome do autor para o retrato que vai no evento. Exige a referência carregada. */
  private authorName(): string {
    return this.author.getEntity().name.value;
  }

  private raiseUpdate(
    title: PostTitle,
    content: PostContent,
    tags: readonly Tag[],
    now: Date,
  ): this {
    this.apply(
      new PostUpdatedEvent(
        this.id.value,
        title.value,
        content.value,
        this.author.id.value,
        this.authorName(),
        tags.map(tag => ({ tagId: tag.id.value, name: tag.name.value })),
        this.version + 1,
        this.createdAt,
        now,
      ),
    );
    return this;
  }

  /** As tags como objetos. Exige a coleção carregada — ver o comentário de {@link Post.tags}. */
  private loadedTags(): Tag[] {
    return this.tags.getItems();
  }

  /** Sem carregar nada: a tabela pivô já dá os ids — agora como `TagId`, e não como texto. */
  hasTag(tagId: TagId | string): boolean {
    return this.tags.getIdentifiers().some(id => id.equals(tagId));
  }

  hasNoTags(): boolean {
    return this.tags.count() === 0;
  }

  // ---- evoluir: reconstituição a partir dos eventos --------------------------------------------

  /** O `apply` chama com o primeiro evento; `loadFromHistory` também. Os VOs são re-validados na fronteira. */
  onPostCreatedEvent(event: PostCreatedEvent): void {
    this.id = PostId.parse(event.postId);
    this.title = PostTitle.parse(event.title);
    this.content = PostContent.parse(event.content);
    this.author = this.sameAuthorOr(event.authorId);
    this.createdAt = event.occurredAt;
    this.updatedAt = event.occurredAt;
    this.version = 1;
    this.applyRestoration();
    this.tags.removeAll();
  }

  /**
   * Idempotente: cada campo recebe um valor absoluto vindo do evento, versão inclusive.
   *
   * As tags são o caso que a relação complicou. O evento devolve **ids**; o agregado `Tag` só existe
   * como objeto se alguém o trouxe — o ORM (um Post populado) ou a decisão (`assignTag`, que põe a Tag
   * na coleção antes de levantar o evento, justamente para que ela esteja aqui). Daí o `atHand`: a
   * lista é remontada reaproveitando os objetos que a coleção já tem, e `rel()` cobre só o que faltar.
   * O evento continua mandando na **participação** — quem não estiver nele sai —, e os objetos apenas
   * sobrevivem à travessia.
   *
   * O que sobra é o replay puro (`loadFromHistory` num Post novo, sem ninguém ter trazido as Tags):
   * as tags voltam como referências não carregadas — os ids conferem, os nomes não vêm. Reidratá-las
   * exige um EntityManager, que o domínio não tem; na prática o Post vem do banco populado.
   *
   * ## Por que reaproveitar os objetos, e não deixar o `rel()` resolver
   * A saída natural pareceria ser confiar no identity map: se o command já carregou a Tag, ela está
   * lá, e `EntityFactory.createReference` de fato consulta `unitOfWork.getById(...)` antes de fabricar
   * um stub. Só que aquele `unitOfWork` não é o da request. `rel()` chega ao factory por
   * `entityType.prototype.__factory`, e o `EntityHelper.decorate` o prende — **uma vez, na
   * descoberta** — a um `em.fork()` dedicado, guardado como campo privado (não há resolução dinâmica
   * por contexto). Medido: dentro do mesmo fork que acabou de carregar a Tag,
   * `em.getReference(Tag, id).name` é `'Untagged'` e `rel(Tag, id).name` é `undefined`. Um eager load
   * no command não muda isso — ele popula o identity map do fork da request, que o `rel()` nunca vê.
   *
   * ## Por que `set()`, e não uma `Collection` nova
   * O construtor da `Collection` aceita itens iniciais (`new Collection(this, tags)`) e é tentador:
   * ele é a única operação que **não** lê a metadata do ORM, então trocá-lo pelo `set()` deixaria o
   * domínio rodar sem nenhum `MikroORM.init` — inclusive no `post.entity.spec`. Não dá, e a razão é
   * o unit of work: uma `Collection` recém-construída nasce com `#dirty = false` e **snapshot vazio**.
   * Sem `setDirty()`, a linha do pivô simplesmente não é gravada (o `assignTag` vira no-op no banco);
   * com `setDirty()`, o diff é calculado contra um snapshot vazio, e um `update` num post que já
   * tinha tags tenta reinserir o que já existe — `UNIQUE constraint failed: posts_tags.post_id,
   * posts_tags.tag_id`. O `set()` é o que propaga **e** mantém o snapshot; a metadata é o preço dele.
   */
  onPostUpdatedEvent(event: PostUpdatedEvent): void {
    this.title = PostTitle.parse(event.title);
    this.content = PostContent.parse(event.content);
    this.updatedAt = event.occurredAt;
    this.version = event.version;
    this.author = this.sameAuthorOr(event.authorId);
    const atHand = new Map(
      this.tags.getItems(false).map(tag => [tag.id.value as string, tag]),
    );
    this.tags.set(
      event.tags.map(
        ({ tagId }) => atHand.get(tagId) ?? rel(Tag, TagId.parse(tagId)),
      ),
    );
  }

  onPostDeletedEvent(event: PostDeletedEvent): void {
    this.applyDeletion(event.occurredAt);
    this.updatedAt = event.occurredAt;
    this.version = event.version;
  }

  onPostRestoredEvent(event: PostRestoredEvent): void {
    this.applyRestoration();
    this.updatedAt = event.occurredAt;
    this.version = event.version;
  }

  /**
   * A referência de autor a usar ao evoluir. Mesma reconciliação das tags, e pelo mesmo motivo: o
   * evento devolve um **id**, e de um id não se materializa o agregado — só uma referência. Se a que
   * já está aqui aponta para o mesmo user, ela permanece (e continua carregada, com o nome que o
   * `raiseUpdate` seguinte precisa); só quando não há nada é que `rel()` fabrica uma nova.
   */
  private sameAuthorOr(authorId: string): Ref<Author> {
    return this.author?.id.equals(authorId)
      ? this.author
      : ref(rel(Author, UserId.parse(authorId)));
  }
}
