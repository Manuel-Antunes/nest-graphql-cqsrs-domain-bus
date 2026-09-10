import { MikroORM, ref, type Ref } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/sqlite';
import { Tag } from '../tag/tag.entity';
import { TagId } from '../tag/vo/tag-id';
import { AUTHOR_ROLE, User } from '../user/user.entity';
import { Users } from '../user/user.factory';
import { type Author } from '../user/author.entity';
import { UserId } from '../user/vo/user-id';
import { UserName } from '../user/vo/user-name';
import { PostCreatedEvent } from './event/post-created.event';
import { PostDeletedEvent } from './event/post-deleted.event';
import { PostRestoredEvent } from './event/post-restored.event';
import { PostUpdatedEvent } from './event/post-updated.event';
import { AlreadyDeletedException } from '../shared/already-deleted.exception';
import { NotDeletedException } from '../shared/not-deleted.exception';
import { InvalidPostException } from './exception/invalid-post.exception';
import { PostNotWrittenByException } from './exception/post-not-written-by.exception';
import { PostSchema } from '../../infrastructure/persistence/sqlite/entities/post-orm.entity';
import { TagSchema } from '../../infrastructure/persistence/sqlite/entities/tag-orm.entity';
import { Post } from './post.entity';
import { PostContent } from './vo/post-content';
import { PostId } from './vo/post-id';
import { PostTitle } from './vo/post-title';

/**
 * Domínio puro: nenhum Nest, nenhum bus, **nenhum banco**. O único colaborador é o próprio aggregate
 * root, que guarda os eventos aplicados em `getUncommittedEvents()` — dá para afirmar exatamente o
 * que foi disparado sem `EventPublisher` nem `EventBus`.
 *
 * O que mudou quando `Post.tags` virou uma relação: uma `Collection` não é uma estrutura de dados
 * solta. Ela precisa saber a que propriedade do dono pertence, e descobre isso lendo a metadata do
 * ORM (`Collection.property` → `wrap(owner).__meta`) — sem descoberta, qualquer `add`/`set` estoura
 * `MetadataError`. Daí o `MikroORM.init` abaixo: ele existe **só para descobrir as entidades**. Sem
 * `ensureDatabase`, nenhuma tabela é criada e nenhum dado é lido ou escrito — o SQLite em memória é
 * um detalhe de que o driver precisa, não um banco que o teste use.
 *
 * É o preço da relação sobre o embeddable, e é o menor possível: `propagationOnPrototype: false` não
 * serve, porque a flag é lida do config de um ORM **já inicializado** (`EntityHelper`) e não passa
 * perto do getter que estoura.
 *
 * É também a única razão pela qual um teste de domínio importa `*-orm.entity` da infraestrutura: ele
 * precisa da metadata, e a metadata é de lá. Nada do código de produção do domínio faz isso.
 */
describe('Post', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init(defineConfig({ dbName: ':memory:', entities: [PostSchema, TagSchema] }));
  });

  afterAll(() => orm.close());

  const id = PostId.parse('0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10');
  const now = new Date('2026-09-08T12:00:00.000Z');
  const later = new Date('2026-09-08T12:05:00.000Z');
  /** O agregado Tag em pessoa — é ele que `assignTag` recebe agora. */
  const tag = () => Tag.create(TagId.parse('5f7a1c7e-4d0b-4b7a-9e3c-1a2b3c4d5e6f'), 'Untagged', now);
  /** A mesma tag como ela atravessa o evento: primitivos, e só. */
  const tagInEvent = { tagId: '5f7a1c7e-4d0b-4b7a-9e3c-1a2b3c4d5e6f', name: 'Untagged' };

  /** O autor dos posts do spec — um agregado `Author`, como manda a relação. */
  const authorId = UserId.parse('9f1d1f36-7c2e-4a0a-9b7d-2f5c1a3e4b60');
  /**
   * O autor como o `Post.create` o exige: uma referência a um {@link Author}, e não a um `User`
   * qualquer. `canWritePosts()` é `this is Author` — é o tipo que faz a triagem, não um `if` solto.
   */
  const anAuthor = (): Ref<Author> => {
    const user = Users.register(authorId, { email: 'manuel@example.com', name: 'manuel' }, AUTHOR_ROLE, now);
    if (!user.canWritePosts()) {
      throw new Error('AUTHOR_ROLE precisa nascer Author');
    }
    return ref(user);
  };
  /** O nome do autor como o `create` o recebe: o retrato que vai no evento, vindo da borda. */
  const authorName = UserName.parse('manuel');
  const aPost = () => Post.create(id, { title: 'Nest + GraphQL', content: 'oi' }, anAuthor(), authorName, now);
  /**
   * O estado observável do Post, sem os internos do aggregate root nem o do ORM. As tags entram como
   * **ids**: é o que a relação garante em qualquer caminho — do decide, do banco ou de um replay.
   */
  const stateOf = ({ id, title, content, author, createdAt, updatedAt, version, tags }: Post) => ({
    id, title, content, author: author.id, createdAt, updatedAt, version, tags: tags.getIdentifiers(),
  });

  it('create normalizes, raises PostCreated and returns the post ready to save', () => {
    const post = Post.create(id, { title: '  Nest + GraphQL  ', content: ' oi ' }, anAuthor(), authorName, now);

    // O estado do Post é feito de value objects: comparar com texto solto não passa mais, e é essa
    // a diferença que o `@Embeddable` traz — `post.title` é um `PostTitle`, não uma `string`.
    expect(post).toMatchObject({
      id,
      title: PostTitle.parse('Nest + GraphQL'),
      content: PostContent.parse('oi'),
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    expect(post.author.id.equals(authorId)).toBe(true);
    expect(post.hasNoTags()).toBe(true);
    expect(post.getUncommittedEvents()).toEqual([new PostCreatedEvent(id.value, 'Nest + GraphQL', 'oi', authorId.value, 'manuel', now)]);
  });

  it('create with an invalid value raises nothing', () => {
    expect(() => Post.create(id, { title: '   ', content: 'oi' }, anAuthor(), authorName, now)).toThrow(InvalidPostException);
    expect(() => Post.create(id, { title: 'ok', content: '' }, anAuthor(), authorName, now)).toThrow(/content não pode ser vazio/);
  });

  it('create rejects a title longer than the maximum', () => {
    expect(() => Post.create(id, { title: 'x'.repeat(201), content: 'oi' }, anAuthor(), authorName, now)).toThrow(
      /title excede 200 caracteres/,
    );
  });

  it('update raises PostUpdated with the resulting state and keeps the tags', () => {
    const post = aPost().assignTag(tag(), now);
    post.uncommit();

    post.update({ title: 'editado' }, later);

    expect(post).toMatchObject({
      title: PostTitle.parse('editado'),
      content: PostContent.parse('oi'),
      updatedAt: later,
      version: 3,
    });
    expect(post.tags.getIdentifiers().map(String)).toEqual([tagInEvent.tagId]);
    expect(post.getUncommittedEvents()).toEqual([
      new PostUpdatedEvent(id.value, 'editado', 'oi', authorId.value, 'manuel', [tagInEvent], 3, now, later),
    ]);
  });

  it('update with null fields keeps the current values', () => {
    const post = aPost();
    post.update({ title: null, content: 'novo conteúdo' }, later);

    expect(post).toMatchObject({
      title: PostTitle.parse('Nest + GraphQL'),
      content: PostContent.parse('novo conteúdo'),
      version: 2,
    });
  });

  it('update without changes raises nothing', () => {
    const post = aPost();
    post.uncommit();

    expect(() => post.update({}, later)).toThrow(/update sem mudanças/);
    expect(() => post.update({ title: 'Nest + GraphQL', content: 'oi' }, later)).toThrow(InvalidPostException);
    expect(post.getUncommittedEvents()).toEqual([]);
    expect(post.version).toBe(1);
  });

  it('update with an invalid value raises nothing', () => {
    const post = aPost();
    post.uncommit();

    expect(() => post.update({ title: '   ' }, later)).toThrow(/title não pode ser vazio/);
    expect(post.getUncommittedEvents()).toEqual([]);
  });

  it('assignTag raises PostUpdated with the tag in the list', () => {
    const post = aPost();
    post.uncommit();

    post.assignTag(tag(), later);

    expect(post.hasTag(tagInEvent.tagId)).toBe(true);
    expect(post.hasNoTags()).toBe(false);
    expect(post.getUncommittedEvents()).toEqual([
      new PostUpdatedEvent(id.value, 'Nest + GraphQL', 'oi', authorId.value, 'manuel', [tagInEvent], 2, now, later),
    ]);
  });

  it('assigning the same tag twice is rejected', () => {
    const post = aPost().assignTag(tag(), later);
    post.uncommit();

    expect(() => post.assignTag(tag(), later)).toThrow(/já tem a tag Untagged/);
    expect(post.getUncommittedEvents()).toEqual([]);
    expect(post.version).toBe(2);
  });

  /**
   * O soft delete pelo lado do agregado: o `Post` **sobrescreve** o `softDelete`/`restore` do mixin e
   * chama `super` antes de disparar o evento. É esse `super` que estes testes provam — a guarda roda
   * antes de existir evento, então nada é registrado quando não há fato novo.
   */
  describe('soft delete', () => {
    it('softDelete marca o post e dispara PostDeleted', () => {
      const post = aPost();
      post.uncommit();

      post.softDelete(later);

      expect(post.isDeleted()).toBe(true);
      expect(post.deletedAt).toEqual(later);
      expect(post.getUncommittedEvents()).toEqual([new PostDeletedEvent(id.value, 2, later)]);
    });

    it('apagar duas vezes é recusado pela guarda do mixin, e nada é disparado', () => {
      const post = aPost().softDelete(later);
      post.uncommit();

      expect(() => post.softDelete(later)).toThrow(AlreadyDeletedException);
      expect(post.getUncommittedEvents()).toEqual([]);
    });

    it('restore desmarca e dispara PostRestored', () => {
      const post = aPost().softDelete(later);
      post.uncommit();

      post.restore(later);

      expect(post.isDeleted()).toBe(false);
      expect(post.deletedAt).toBeNull();
      expect(post.getUncommittedEvents()).toEqual([new PostRestoredEvent(id.value, 3, later)]);
    });

    it('restaurar o que não está apagado é recusado, e nada é disparado', () => {
      const post = aPost();
      post.uncommit();

      expect(() => post.restore(later)).toThrow(NotDeletedException);
      expect(post.getUncommittedEvents()).toEqual([]);
    });

    it('o evento de exclusão é idempotente: aplicá-lo duas vezes dá o mesmo estado', () => {
      const post = aPost();
      const event = new PostDeletedEvent(id.value, 2, later);

      post.apply(event, { fromHistory: true });
      const once = { deletedAt: post.deletedAt, version: post.version };
      post.apply(event, { fromHistory: true });

      expect({ deletedAt: post.deletedAt, version: post.version }).toEqual(once);
    });
  });

  it('the state returned by update is the same as sourcing the raised events', () => {
    const decided = aPost().assignTag(tag(), now).update({ content: 'editado' }, later);

    const sourced = new Post();
    sourced.loadFromHistory(decided.getUncommittedEvents());

    expect(stateOf(sourced)).toEqual(stateOf(decided));
    expect(sourced.getUncommittedEvents()).toEqual([]);
  });

  it('applying the same event twice leaves the same state', () => {
    const post = aPost();
    const event = new PostUpdatedEvent(id.value, 'editado', 'oi', authorId.value, 'manuel', [tagInEvent], 2, now, later);

    post.apply(event, { fromHistory: true });
    const once = stateOf(post);
    post.apply(event, { fromHistory: true });

    expect(stateOf(post)).toEqual(once);
    expect(post.version).toBe(2);
  });
  /**
   * A invariante de **propriedade**, que mora no agregado e não só na borda.
   *
   * A guarda de borda (`@Roles([AUTHOR_ROLE])`) responde "esta pessoa pode escrever posts?"; esta
   * responde "pode escrever *este*?". A diferença aparece justamente onde não há guard nenhum — um
   * command despachado por uma saga, por exemplo —, e é por isso que ela não pode viver só no
   * resolver.
   */
  describe('assertWrittenBy', () => {
    /** Outro autor, com id próprio: é a identidade que decide, não o nome nem o papel. */
    const outroAutor = () =>
      Users.register(
        UserId.parse('3c2b1a09-8f7e-4d6c-9b5a-1e2d3c4b5a60'),
        { email: 'outro@example.com', name: 'outro' },
        AUTHOR_ROLE,
        now,
      );

    it('quem escreveu o post passa, e o próprio post volta para encadear', () => {
      // Arrange
      const post = aPost();
      const autor = post.author.getEntity();

      // Act / Assert
      expect(post.assertWrittenBy(autor)).toBe(post);
    });

    it('quem não escreveu é recusado, nomeando o post e quem tentou', () => {
      // Arrange
      const post = aPost();
      const intruso = outroAutor();

      // Act / Assert
      expect(() => post.assertWrittenBy(intruso)).toThrow(PostNotWrittenByException);
      expect(() => post.assertWrittenBy(intruso)).toThrow(new RegExp(id.value));
    });

    /**
     * A comparação é por **identidade**, e não por instância: o autor que veio do banco e o que um
     * replay montou são objetos diferentes com o mesmo id, e os dois precisam passar.
     */
    it('compara por id, então o autor relido de outra origem também passa', () => {
      // Arrange
      const post = aPost();
      const mesmoAutorOutraInstancia = Users.register(
        authorId,
        { email: 'manuel@example.com', name: 'manuel' },
        AUTHOR_ROLE,
        later,
      );

      // Act / Assert
      expect(mesmoAutorOutraInstancia).not.toBe(post.author.getEntity());
      expect(() => post.assertWrittenBy(mesmoAutorOutraInstancia)).not.toThrow();
    });

    /** Ser autor não basta: um `Author` que não escreveu *este* post é recusado igual. */
    it('ter o papel de autor não substitui ser o autor deste post', () => {
      // Arrange
      const post = aPost();
      const outro = outroAutor();

      // Assert
      expect(outro.canWritePosts()).toBe(true);
      expect(() => post.assertWrittenBy(outro)).toThrow(PostNotWrittenByException);
    });

    it('a recusa não muda nada no post: nenhum evento é disparado', () => {
      // Arrange
      const post = aPost();
      post.uncommit();

      // Act
      expect(() => post.assertWrittenBy(outroAutor())).toThrow();

      // Assert
      expect(post.getUncommittedEvents()).toEqual([]);
    });
  });
});
