import { defineEntity, p } from '@mikro-orm/core';
import { z } from 'zod';
import { AggregateEntity } from '../shared/aggregate-entity';
import { PostCreatedEvent } from './event/post-created.event';
import { PostUpdatedEvent } from './event/post-updated.event';
import { InvalidPostException } from './exception/invalid-post.exception';
import { Author } from './vo/author';
import { PostContent } from './vo/post-content';
import { PostId } from './vo/post-id';
import { PostTitle } from './vo/post-title';
import { TagRefSchema, type TagRef } from './vo/tag-ref';

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
 * construtor que o mixin `WithAggregateRoot` inicializa a lista de eventos não-commitados. Com
 * `forceConstructor: true` no schema, um Post que volta do banco nasce pelo `new` e chega inteiro.
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
  /** Cópias de id + nome das tags — ver `TagRef`. */
  tags!: TagRef[];

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
    return this.raiseUpdate(title, content, this.tags, now);
  }

  /**
   * Assinala uma tag ao post e dispara `PostUpdatedEvent` com a lista de tags resultante — o mesmo
   * evento de update, porque a tag faz parte do estado do post, não de um ciclo de vida à parte.
   *
   * @throws InvalidPostException se o post já tiver essa tag
   */
  assignTag(tag: TagRef, now: Date): this {
    if (this.hasTag(tag.tagId)) {
      throw new InvalidPostException(`post já tem a tag ${tag.name}`);
    }
    return this.raiseUpdate(this.title, this.content, [...this.tags, tag], now);
  }

  private raiseUpdate(title: PostTitle, content: PostContent, tags: readonly TagRef[], now: Date): this {
    this.apply(
      new PostUpdatedEvent(
        this.id,
        title,
        content,
        this.author,
        tags.map(({ tagId, name }) => ({ tagId, name })),
        this.version + 1,
        this.createdAt,
        now,
      ),
    );
    return this;
  }

  hasTag(tagId: string): boolean {
    return this.tags.some((tag) => tag.tagId === tagId);
  }

  hasNoTags(): boolean {
    return this.tags.length === 0;
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
    this.tags = [];
  }

  /** Idempotente: cada campo recebe um valor absoluto vindo do evento, versão inclusive. */
  onPostUpdatedEvent(event: PostUpdatedEvent): void {
    this.title = PostTitle.parse(event.title);
    this.content = PostContent.parse(event.content);
    this.updatedAt = event.occurredAt;
    this.version = event.version;
    this.tags = event.tags.map(({ tagId, name }) => ({ tagId, name }));
  }
}

/**
 * O mapeamento do Post, pelo `defineEntity` do MikroORM v7 apontando para a classe acima. Os value
 * objects são colunas simples (`title`, `content`, `author`) — o tipo *branded* é do TypeScript, o banco
 * vê texto; as tags são um array de embeddables, gravado como JSON na própria linha.
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
    tags: () => p.embedded(TagRefSchema).array(),
  },
  indexes: [{ properties: ['createdAt', 'id'] }],
});
