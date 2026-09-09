import { Collection, defineEntity, p, rel } from '@mikro-orm/core';
import { z } from 'zod';
import { Tag, TagSchema } from '../tag/tag.entity';
import { TagId } from '../tag/vo/tag-id';
import { AggregateEntity } from '../shared/aggregate-entity';
import { PostCreatedEvent } from './event/post-created.event';
import { PostUpdatedEvent } from './event/post-updated.event';
import { InvalidPostException } from './exception/invalid-post.exception';
import { Author } from './vo/author';
import { PostContent } from './vo/post-content';
import { PostId } from './vo/post-id';
import { PostTitle } from './vo/post-title';

/** Os eventos que um Post dispara — o tipo que `apply`/`getUncommittedEvents` conhecem. */
export type PostEvent = PostCreatedEvent | PostUpdatedEvent;

/** O que é preciso para nascer um Post: os três value objects, validados juntos, num `safeParse` só. */
const NewPost = z.object({ title: PostTitle, content: PostContent, author: Author });

/** O que um update parcial pode trazer: `null`/ausente significa "manter o valor atual". */
const PostChanges = z.object({ title: PostTitle.nullish(), content: PostContent.nullish() });
export type PostChanges = z.input<typeof PostChanges>;

/**
 * O Post: **uma** classe que é ao mesmo tempo a entidade de domínio, o aggregate root do @nestjs/cqrs
 * e o mapeamento do MikroORM (`PostSchema`, logo abaixo, via `defineEntity({ class: Post })`).
 * Não existe um "PostEntity" espelho para manter em sincronia.
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
export class Post extends AggregateEntity<PostEvent> {
  id!: PostId;
  title!: PostTitle;
  content!: PostContent;
  author!: Author;
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
   * @throws InvalidPostException se title, content ou author violarem suas invariantes
   */
  static create(id: PostId, input: { title: string; content: string; author: string }, now: Date): Post {
    const parsed = NewPost.safeParse(input);
    if (!parsed.success) {
      throw InvalidPostException.fromZod(parsed.error);
    }
    const post = new Post();
    post.apply(new PostCreatedEvent(id, parsed.data.title, parsed.data.content, parsed.data.author, now));
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
    if (title === this.title && content === this.content) {
      throw new InvalidPostException('update sem mudanças: informe um title e/ou content diferente do atual');
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

  private raiseUpdate(title: PostTitle, content: PostContent, tags: readonly Tag[], now: Date): this {
    this.apply(
      new PostUpdatedEvent(
        this.id,
        title,
        content,
        this.author,
        tags.map((tag) => ({ tagId: tag.id, name: tag.name })),
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

  /** Sem carregar nada: a tabela pivô já dá os ids. */
  hasTag(tagId: string): boolean {
    return this.tags.getIdentifiers().includes(tagId as TagId);
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
    this.author = Author.parse(event.author);
    this.createdAt = event.occurredAt;
    this.updatedAt = event.occurredAt;
    this.version = 1;
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
    const atHand = new Map(this.tags.getItems(false).map((tag) => [tag.id as string, tag]));
    this.tags.set(event.tags.map(({ tagId }) => atHand.get(tagId) ?? rel(Tag, TagId.parse(tagId))));
  }
}

/**
 * O mapeamento do Post, pelo `defineEntity` do MikroORM v7 apontando para a classe acima. Os value
 * objects são colunas simples (`title`, `content`, `author`) — o tipo *branded* é do TypeScript, o banco
 * vê texto; as tags são uma relação many-to-many, com a tabela pivô que o ORM cria (`post_tags`).
 */
export const PostSchema = defineEntity({
  class: Post,
  tableName: 'posts',
  forceConstructor: true,
  properties: {
    id: p.string().primary().length(36),
    title: p.string().length(200),
    content: p.text(),
    author: p.string().length(100),
    createdAt: p.datetime(),
    updatedAt: p.datetime(),
    version: p.integer(),
    tags: () => p.manyToMany(TagSchema).owner(),
  },
  indexes: [{ properties: ['createdAt', 'id'] }],
});
