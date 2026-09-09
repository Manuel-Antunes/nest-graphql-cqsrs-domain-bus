import { MikroORM } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/sqlite';
import { Tag, TagSchema } from '../tag/tag.entity';
import { TagId } from '../tag/vo/tag-id';
import { PostCreatedEvent } from './event/post-created.event';
import { PostUpdatedEvent } from './event/post-updated.event';
import { InvalidPostException } from './exception/invalid-post.exception';
import { Post, PostSchema } from './post.entity';
import { PostId } from './vo/post-id';

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

  const aPost = () => Post.create(id, { title: 'Nest + GraphQL', content: 'oi', author: 'manuel' }, now);
  /**
   * O estado observável do Post, sem os internos do aggregate root nem o do ORM. As tags entram como
   * **ids**: é o que a relação garante em qualquer caminho — do decide, do banco ou de um replay.
   */
  const stateOf = ({ id, title, content, author, createdAt, updatedAt, version, tags }: Post) => ({
    id, title, content, author, createdAt, updatedAt, version, tags: tags.getIdentifiers(),
  });

  it('create normalizes, raises PostCreated and returns the post ready to save', () => {
    const post = Post.create(id, { title: '  Nest + GraphQL  ', content: ' oi ', author: ' manuel ' }, now);

    expect(post).toMatchObject({
      id,
      title: 'Nest + GraphQL',
      content: 'oi',
      author: 'manuel',
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    expect(post.hasNoTags()).toBe(true);
    expect(post.getUncommittedEvents()).toEqual([new PostCreatedEvent(id, 'Nest + GraphQL', 'oi', 'manuel', now)]);
  });

  it('create with an invalid value raises nothing', () => {
    expect(() => Post.create(id, { title: '   ', content: 'oi', author: 'manuel' }, now)).toThrow(InvalidPostException);
    expect(() => Post.create(id, { title: 'ok', content: '', author: 'manuel' }, now)).toThrow(/content não pode ser vazio/);
  });

  it('create rejects a title longer than the maximum', () => {
    expect(() => Post.create(id, { title: 'x'.repeat(201), content: 'oi', author: 'manuel' }, now)).toThrow(
      /title excede 200 caracteres/,
    );
  });

  it('update raises PostUpdated with the resulting state and keeps the tags', () => {
    const post = aPost().assignTag(tag(), now);
    post.uncommit();

    post.update({ title: 'editado' }, later);

    expect(post).toMatchObject({ title: 'editado', content: 'oi', updatedAt: later, version: 3 });
    expect(post.tags.getIdentifiers()).toEqual([tagInEvent.tagId]);
    expect(post.getUncommittedEvents()).toEqual([
      new PostUpdatedEvent(id, 'editado', 'oi', 'manuel', [tagInEvent], 3, now, later),
    ]);
  });

  it('update with null fields keeps the current values', () => {
    const post = aPost();
    post.update({ title: null, content: 'novo conteúdo' }, later);

    expect(post).toMatchObject({ title: 'Nest + GraphQL', content: 'novo conteúdo', version: 2 });
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
      new PostUpdatedEvent(id, 'Nest + GraphQL', 'oi', 'manuel', [tagInEvent], 2, now, later),
    ]);
  });

  it('assigning the same tag twice is rejected', () => {
    const post = aPost().assignTag(tag(), later);
    post.uncommit();

    expect(() => post.assignTag(tag(), later)).toThrow(/já tem a tag Untagged/);
    expect(post.getUncommittedEvents()).toEqual([]);
    expect(post.version).toBe(2);
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
    const event = new PostUpdatedEvent(id, 'editado', 'oi', 'manuel', [tagInEvent], 2, now, later);

    post.apply(event, { fromHistory: true });
    const once = stateOf(post);
    post.apply(event, { fromHistory: true });

    expect(stateOf(post)).toEqual(once);
    expect(post.version).toBe(2);
  });
});
