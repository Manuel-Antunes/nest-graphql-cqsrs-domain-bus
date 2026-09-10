import { MikroORM, ref, type Ref } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/sqlite';
import { PostCreatedEvent } from '../../domain/post/event/post-created.event';
import { PostUpdatedEvent } from '../../domain/post/event/post-updated.event';
import { Post } from '../../domain/post/post.entity';
import { PostContent } from '../../domain/post/vo/post-content';
import { PostId } from '../../domain/post/vo/post-id';
import { PostTitle } from '../../domain/post/vo/post-title';
import { Tag } from '../../domain/tag/tag.entity';
import { TagId } from '../../domain/tag/vo/tag-id';
import type { Author } from '../../domain/user/author.entity';
import { AUTHOR_ROLE } from '../../domain/user/user.entity';
import { Users } from '../../domain/user/user.factory';
import { UserId } from '../../domain/user/vo/user-id';
import { UserName } from '../../domain/user/vo/user-name';
import { PostSchema } from '../../infrastructure/persistence/sqlite/entities/post-orm.entity';
import { TagSchema } from '../../infrastructure/persistence/sqlite/entities/tag-orm.entity';
import {
  AuthorSchema,
  ReaderSchema,
  UserSchema,
} from '../../infrastructure/persistence/sqlite/entities/user-orm.entity';
import { TagView } from '../../dto/graphql/tag.view';
import { PostViewMapper } from './post-view.mapper';

/**
 * Domínio → protocolo. O mapper tem três origens e um destino, e o que estes testes prendem é que as
 * **três produzam a mesma view** — porque o cliente do GraphQL recebe o mesmo tipo `Post` de uma
 * query, de uma mutation e de uma subscription, e não pode notar por qual porta ele veio.
 *
 * As duas travessias de evento são as que mais pedem teste, porque elas montam a view **sem consultar
 * o banco**: o que estiver faltando no payload não tem de onde ser buscado. `fromCreatedEvent` fixa
 * `version: 1` e `tags: []` de propósito — um post nasce sem tag, e a padrão chega depois, por
 * `onPostUpdated`.
 *
 * O `MikroORM.init` existe só para descobrir as entidades (a `Collection` de tags e a `Ref` do autor
 * precisam da metadata). Sem `ensureDatabase`, nenhuma tabela é criada e nada é lido ou escrito.
 */
describe('PostViewMapper', () => {
  let orm: MikroORM;
  const mapper = new PostViewMapper();

  beforeAll(async () => {
    orm = await MikroORM.init(
      defineConfig({
        dbName: ':memory:',
        entities: [PostSchema, TagSchema, UserSchema, ReaderSchema, AuthorSchema],
      }),
    );
  });

  afterAll(() => orm.close());

  const id = PostId.parse('0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10');
  const tagId = TagId.parse('5f7a1c7e-4d0b-4b7a-9e3c-1a2b3c4d5e6f');
  const authorId = UserId.parse('9f1d1f36-7c2e-4a0a-9b7d-2f5c1a3e4b60');
  const now = new Date('2026-09-08T12:00:00.000Z');
  const later = new Date('2026-09-08T12:05:00.000Z');

  const anAuthor = (): Ref<Author> => {
    const user = Users.register(authorId, { email: 'manuel@example.com', name: 'manuel' }, AUTHOR_ROLE, now);
    if (!user.canWritePosts()) {
      throw new Error('AUTHOR_ROLE precisa nascer Author');
    }
    return ref(user);
  };
  const aTag = () => Tag.create(tagId, 'Untagged', now);
  const aPost = () =>
    Post.create(id, { title: 'Nest + GraphQL', content: 'oi' }, anAuthor(), UserName.parse('manuel'), now);

  describe('fromPost: a entidade, para queries e mutations', () => {
    it('achata o agregado na view, com os value objects preservados', () => {
      // Arrange
      const post = aPost();

      // Act
      const view = mapper.fromPost(post);

      // Assert
      expect(view.id.equals(id)).toBe(true);
      expect(view.title).toEqual(PostTitle.parse('Nest + GraphQL'));
      expect(view.content).toEqual(PostContent.parse('oi'));
      expect(view.authorId.equals(authorId)).toBe(true);
      expect(view.createdAt).toBe(now);
      expect(view.updatedAt).toBe(now);
      expect(view.version).toBe(1);
      expect(view.tags).toEqual([]);
    });

    /**
     * O que sai para a view é a **identidade** do autor, e não um retrato dele: o `Post.author` do
     * protocolo é um `type Author`, resolvido à parte pelo `PostAuthorResolver`.
     *
     * Repare no que esta linha deixou de exigir: a `Ref` **carregada**. Ler `post.author.id` não toca o
     * banco — a referência conhece a chave —, enquanto o `post.author.getEntity().name` de antes
     * estourava se o repositório não tivesse populado o autor. O populate continua lá, e agora serve
     * outra coisa: é ele que faz a resolução do campo custar zero consultas.
     */
    it('leva a identidade do autor, e não um retrato dele', () => {
      // Arrange
      const post = aPost();

      // Act / Assert
      expect(mapper.fromPost(post).authorId.equals(authorId)).toBe(true);
    });

    it('traz as tags do post como TagView', () => {
      // Arrange
      const post = aPost().assignTag(aTag(), later);

      // Act
      const view = mapper.fromPost(post);

      // Assert
      expect(view.tags).toHaveLength(1);
      expect(view.tags[0]).toBeInstanceOf(TagView);
      expect(view.tags[0].id.equals(tagId)).toBe(true);
      expect(view.tags[0].name.value).toBe('Untagged');
      expect(view.version).toBe(2);
    });
  });

  describe('fromCreatedEvent: o payload, para a subscription', () => {
    it('monta a view do que passou pelo EventBus, sem tocar o banco', () => {
      // Arrange
      const event = new PostCreatedEvent(id.value, 'Nest + GraphQL', 'oi', authorId.value, 'manuel', now);

      // Act
      const view = mapper.fromCreatedEvent(event);

      // Assert
      expect(view.id.equals(id)).toBe(true);
      expect(view.title.value).toBe('Nest + GraphQL');
      expect(view.content.value).toBe('oi');
      expect(view.authorId.equals(authorId)).toBe(true);
    });

    /**
     * Um post nasce em `version: 1` e **sem tags** — a padrão é atribuída pela saga, depois, e chega
     * ao assinante pelo `onPostUpdated`. Fixar isso aqui é o que impede a view de mentir sobre o
     * estado no instante da criação.
     */
    it('o post nasce na versão 1 e sem tags; createdAt e updatedAt são o mesmo instante', () => {
      // Arrange
      const event = new PostCreatedEvent(id.value, 'titulo', 'corpo', authorId.value, 'manuel', now);

      // Act
      const view = mapper.fromCreatedEvent(event);

      // Assert
      expect(view.version).toBe(1);
      expect(view.tags).toEqual([]);
      expect(view.createdAt).toBe(now);
      expect(view.updatedAt).toBe(now);
    });
  });

  describe('fromUpdatedEvent: o payload de uma atualização', () => {
    const updated = () =>
      new PostUpdatedEvent(
        id.value,
        'editado',
        'novo corpo',
        authorId.value,
        'manuel',
        [{ tagId: tagId.value, name: 'Untagged' }],
        3,
        now,
        later,
      );

    it('separa o instante de criação do de atualização', () => {
      // Act
      const view = mapper.fromUpdatedEvent(updated());

      // Assert
      expect(view.createdAt).toBe(now);
      expect(view.updatedAt).toBe(later);
      expect(view.version).toBe(3);
    });

    it('traduz as tags que o evento carrega em TagView', () => {
      // Act
      const view = mapper.fromUpdatedEvent(updated());

      // Assert
      expect(view.tags).toHaveLength(1);
      expect(view.tags[0]).toBeInstanceOf(TagView);
      expect(view.tags[0].name.value).toBe('Untagged');
    });

    it('um evento sem tags produz uma view sem tags, e não uma view quebrada', () => {
      // Arrange
      const event = new PostUpdatedEvent(id.value, 't', 'c', authorId.value, 'manuel', [], 2, now, later);

      // Act / Assert
      expect(mapper.fromUpdatedEvent(event).tags).toEqual([]);
    });
  });

  /**
   * A garantia que amarra as três: o mesmo post, pelas três portas, é a mesma view. É o que o cliente
   * do GraphQL vê, e o que o `schema.gql` promete.
   */
  it('as três origens produzem a mesma forma serializada', () => {
    // Arrange
    const post = aPost();
    const created = new PostCreatedEvent(id.value, 'Nest + GraphQL', 'oi', authorId.value, 'manuel', now);
    const updatedSameState = new PostUpdatedEvent(
      id.value, 'Nest + GraphQL', 'oi', authorId.value, 'manuel', [], 1, now, now,
    );

    // Act
    const asJson = (view: unknown) => JSON.parse(JSON.stringify(view));

    // Assert
    expect(asJson(mapper.fromCreatedEvent(created))).toEqual(asJson(mapper.fromPost(post)));
    expect(asJson(mapper.fromUpdatedEvent(updatedSameState))).toEqual(asJson(mapper.fromPost(post)));
  });
});
