import { MikroORM } from '@mikro-orm/core';
import { Asset } from '@nestposts/asset/domain/data-objects/asset';
import { metadataOnly } from '@nestposts/database/testing';
import type { DelegatedRef } from '@nestposts/platform/domain/shared/delegation/delegate';
import { delegateRef } from '@nestposts/platform/domain/shared/delegation/delegate';
import { AlreadyDeletedException } from '@nestposts/platform/domain/shared/soft-delete/already-deleted.exception';
import { NotDeletedException } from '@nestposts/platform/domain/shared/soft-delete/not-deleted.exception';
import { issuesOf } from '@nestposts/platform/testing/invalid-input';
import {
  AUTHOR_ROLE,
  Author,
  Authorship,
} from '@nestposts/users/domain/user/author.entity';
import { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { UserName } from '@nestposts/users/domain/user/vo/user-name';

import { PostEntitySchema } from '../../infrastructure/persistence/entities/post-orm.entity';
import { TagSchema } from '../../infrastructure/persistence/entities/tag-orm.entity';
import { Tag } from '../tag/tag.entity';
import { TagId } from '../tag/vo/tag-id';
import { PostCreatedEvent } from './event/post-created.event';
import { PostDeletedEvent } from './event/post-deleted.event';
import { PostPreCreatedEvent } from './event/post-pre-created.event';
import { PostRestoredEvent } from './event/post-restored.event';
import { PostUpdatedEvent } from './event/post-updated.event';
import { InvalidPostException } from './exception/invalid-post.exception';
import { PostNotWrittenByException } from './exception/post-not-written-by.exception';
import { Post } from './post.entity';
import { PostContent } from './vo/post-content';
import { PostId } from './vo/post-id';
import { PostTitle } from './vo/post-title';

describe('Post', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await metadataOnly([PostEntitySchema, TagSchema]);
  });

  afterAll(() => orm.close());

  const id = PostId.parse('0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10');
  const now = new Date('2026-09-08T12:00:00.000Z');
  const later = new Date('2026-09-08T12:05:00.000Z');
  const tag = () =>
    Tag.create(
      TagId.parse('5f7a1c7e-4d0b-4b7a-9e3c-1a2b3c4d5e6f'),
      'Untagged',
      now,
    );
  const tagInEvent = {
    tagId: '5f7a1c7e-4d0b-4b7a-9e3c-1a2b3c4d5e6f',
    name: 'Untagged',
  };

  const authorId = UserId.parse('9f1d1f36-7c2e-4a0a-9b7d-2f5c1a3e4b60');
  const anAuthor = (at = now): DelegatedRef<Authorship, Author> =>
    delegateRef(
      Author,
      Authorship.of(
        User.register(
          authorId,
          { email: 'manuel@example.com', name: 'manuel' },
          [AUTHOR_ROLE],
          at,
        ),
      ),
    );
  const authorName = UserName.parse('manuel');
  const aPost = () =>
    Post.create(
      id,
      { title: 'Nest + GraphQL', content: 'oi' },
      anAuthor(),
      authorName,
      now,
    );
  const stateOf = ({
    id,
    title,
    content,
    author,
    createdAt,
    updatedAt,
    version,
    tags,
  }: Post) => ({
    id,
    title,
    content,
    author: author.id,
    createdAt,
    updatedAt,
    version,
    tags: tags.getIdentifiers(),
  });

  it('create normalizes, raises PostPreCreated and returns a post that is not complete yet', () => {
    const post = Post.create(
      id,
      { title: '  Nest + GraphQL  ', content: ' oi ' },
      anAuthor(),
      authorName,
      now,
    );

    expect(post).toMatchObject({
      id,
      title: PostTitle.parse('Nest + GraphQL'),
      content: PostContent.parse('oi'),
      createdAt: now,
      updatedAt: now,
      version: 1,
      publishedAt: null,
    });
    expect(post.author.id.equals(authorId)).toBe(true);
    expect(post.hasNoTags()).toBe(true);
    expect(post.isComplete()).toBe(false);
    expect(post.getUncommittedEvents()).toEqual([
      new PostPreCreatedEvent(
        id.value,
        'Nest + GraphQL',
        'oi',
        authorId.value,
        'manuel',
        now,
      ),
    ]);
  });

  describe('completing the creation', () => {
    it('raises PostCreated with the first tag, and the post reaches version 2', () => {
      const post = aPost();
      post.uncommit();

      post.complete([tag()], later);

      expect(post).toMatchObject({
        version: 2,
        publishedAt: later,
        updatedAt: later,
      });
      expect(post.isComplete()).toBe(true);
      expect(post.tags.getIdentifiers().map(String)).toEqual([
        tagInEvent.tagId,
      ]);
      expect(post.getUncommittedEvents()).toEqual([
        new PostCreatedEvent(
          id.value,
          'Nest + GraphQL',
          'oi',
          authorId.value,
          [tagInEvent],
          2,
          later,
        ),
      ]);
    });

    it('is where a post born with tags goes, in the same unit of work', () => {
      const post = Post.create(
        id,
        { title: 'Nest', content: 'oi' },
        anAuthor(),
        authorName,
        now,
        [tag()],
      );

      expect(post.isComplete()).toBe(true);
      expect(post.version).toBe(2);
      expect(
        post.getUncommittedEvents().map((event) => event.constructor.name),
      ).toEqual(['PostPreCreatedEvent', 'PostCreatedEvent']);
    });

    it('refuses a second completion, because a post is published once', () => {
      const post = aPost().complete([tag()], later);
      post.uncommit();

      expect(() => post.complete([tag()], later)).toThrow(InvalidPostException);
      expect(post.getUncommittedEvents()).toEqual([]);
    });

    it('refuses to complete with no tag at all', () => {
      const post = aPost();
      post.uncommit();

      expect(() => post.complete([], later)).toThrow(InvalidPostException);
      expect(post.isComplete()).toBe(false);
      expect(post.getUncommittedEvents()).toEqual([]);
    });

    it('is idempotent as a transition: applying PostCreated twice leaves the same state', () => {
      const completed = aPost().complete([tag()], later);
      const event = completed.getUncommittedEvents().at(-1) as PostCreatedEvent;

      const sourced = Post.from({});
      sourced.loadFromHistory([
        new PostPreCreatedEvent(
          id.value,
          'Nest + GraphQL',
          'oi',
          authorId.value,
          'manuel',
          now,
        ),
        event,
        event,
      ]);

      expect(sourced.version).toBe(2);
      expect(sourced.publishedAt).toEqual(later);
      expect(sourced.tags.getIdentifiers().map(String)).toEqual([
        tagInEvent.tagId,
      ]);
    });
  });

  it('create with an invalid value raises nothing', () => {
    expect(() =>
      Post.create(
        id,
        { title: '   ', content: 'oi' },
        anAuthor(),
        authorName,
        now,
      ),
    ).toThrow(InvalidPostException);
    expect(
      issuesOf(() =>
        Post.create(
          id,
          { title: 'ok', content: '' },
          anAuthor(),
          authorName,
          now,
        ),
      ),
    ).toContain('content não pode ser vazio');
  });

  it('create rejects a title longer than the maximum', () => {
    expect(
      issuesOf(() =>
        Post.create(
          id,
          { title: 'x'.repeat(201), content: 'oi' },
          anAuthor(),
          authorName,
          now,
        ),
      ),
    ).toContain('title excede 200 caracteres');
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
      new PostUpdatedEvent(
        id.value,
        'editado',
        'oi',
        authorId.value,
        'manuel',
        [tagInEvent],
        3,
        now,
        later,
      ),
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
    expect(() =>
      post.update({ title: 'Nest + GraphQL', content: 'oi' }, later),
    ).toThrow(InvalidPostException);
    expect(post.getUncommittedEvents()).toEqual([]);
    expect(post.version).toBe(1);
  });

  it('update with an invalid value raises nothing', () => {
    const post = aPost();
    post.uncommit();

    expect(issuesOf(() => post.update({ title: '   ' }, later))).toContain(
      'title não pode ser vazio',
    );
    expect(post.getUncommittedEvents()).toEqual([]);
  });

  it('assignTag raises PostUpdated with the tag in the list', () => {
    const post = aPost();
    post.uncommit();

    post.assignTag(tag(), later);

    expect(post.hasTag(tagInEvent.tagId)).toBe(true);
    expect(post.hasNoTags()).toBe(false);
    expect(post.getUncommittedEvents()).toEqual([
      new PostUpdatedEvent(
        id.value,
        'Nest + GraphQL',
        'oi',
        authorId.value,
        'manuel',
        [tagInEvent],
        2,
        now,
        later,
      ),
    ]);
  });

  it('assigning the same tag twice is rejected', () => {
    const post = aPost().assignTag(tag(), later);
    post.uncommit();

    expect(() => post.assignTag(tag(), later)).toThrow(/já tem a tag Untagged/);
    expect(post.getUncommittedEvents()).toEqual([]);
    expect(post.version).toBe(2);
  });

  describe('soft delete', () => {
    it('softDelete marca o post e dispara PostDeleted', () => {
      const post = aPost();
      post.uncommit();

      post.softDelete(later);

      expect(post.isDeleted()).toBe(true);
      expect(post.deletedAt).toEqual(later);
      expect(post.getUncommittedEvents()).toEqual([
        new PostDeletedEvent(id.value, 2, later),
      ]);
    });

    it('lets go of its attachment, so the file goes with the post', () => {
      const post = aPost();
      post.asset = new Asset({
        name: 'assets/cover.png',
        size: 4,
        extname: 'png',
        mimeType: 'image/png',
        persisted: true,
      });

      post.softDelete(later);

      expect(post.asset).toBeNull();
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
      expect(post.getUncommittedEvents()).toEqual([
        new PostRestoredEvent(id.value, 3, later),
      ]);
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

      expect({ deletedAt: post.deletedAt, version: post.version }).toEqual(
        once,
      );
    });
  });

  it('the state returned by update is the same as sourcing the raised events', () => {
    const decided = aPost()
      .assignTag(tag(), now)
      .update({ content: 'editado' }, later);

    const sourced = new Post();
    sourced.loadFromHistory(decided.getUncommittedEvents());

    expect(stateOf(sourced)).toEqual(stateOf(decided));
    expect(sourced.getUncommittedEvents()).toEqual([]);
  });

  it('applying the same event twice leaves the same state', () => {
    const post = aPost();
    const event = new PostUpdatedEvent(
      id.value,
      'editado',
      'oi',
      authorId.value,
      'manuel',
      [tagInEvent],
      2,
      now,
      later,
    );

    post.apply(event, { fromHistory: true });
    const once = stateOf(post);
    post.apply(event, { fromHistory: true });

    expect(stateOf(post)).toEqual(once);
    expect(post.version).toBe(2);
  });
  describe('assertWrittenBy', () => {
    const outroAutor = () =>
      User.register(
        UserId.parse('3c2b1a09-8f7e-4d6c-9b5a-1e2d3c4b5a60'),
        { email: 'outro@example.com', name: 'outro' },
        [AUTHOR_ROLE],
        now,
      );

    it('quem escreveu o post passa, e o próprio post volta para encadear', () => {
      const post = aPost();
      const autor = post.author.delegated();

      expect(post.assertWrittenBy(autor)).toBe(post);
    });

    it('quem não escreveu é recusado, nomeando o post e quem tentou', () => {
      const post = aPost();
      const intruso = outroAutor();

      expect(() => post.assertWrittenBy(intruso)).toThrow(
        PostNotWrittenByException,
      );
      expect(() => post.assertWrittenBy(intruso)).toThrow(new RegExp(id.value));
    });

    it('compara por id, então o autor relido de outra origem também passa', () => {
      const post = aPost();
      const mesmoAutorOutraInstancia = User.register(
        authorId,
        { email: 'manuel@example.com', name: 'manuel' },
        [AUTHOR_ROLE],
        later,
      );

      expect(mesmoAutorOutraInstancia).not.toBe(post.author.delegated());
      expect(() =>
        post.assertWrittenBy(mesmoAutorOutraInstancia),
      ).not.toThrow();
    });

    it('ter o papel de autor não substitui ser o autor deste post', () => {
      const post = aPost();
      const outro = outroAutor();

      expect(outro.hasRole(AUTHOR_ROLE)).toBe(true);
      expect(() => post.assertWrittenBy(outro)).toThrow(
        PostNotWrittenByException,
      );
    });

    it('a recusa não muda nada no post: nenhum evento é disparado', () => {
      const post = aPost();
      post.uncommit();

      expect(() => post.assertWrittenBy(outroAutor())).toThrow();

      expect(post.getUncommittedEvents()).toEqual([]);
    });
  });
  describe('props-based construction and state invariants', () => {
    it('builds the scalar state straight from props, without the ORM', () => {
      const post = Post.from({
        id,
        title: PostTitle.parse('Nest + GraphQL'),
        content: PostContent.parse('oi'),
        createdAt: now,
        updatedAt: now,
        version: 1,
      });

      expect(post).toMatchObject({
        id,
        createdAt: now,
        updatedAt: now,
        version: 1,
      });
      expect(post.title).toEqual(PostTitle.parse('Nest + GraphQL'));
      expect(post.getUncommittedEvents()).toEqual([]);
    });

    it('takes a relation from props, as a reference', () => {
      const post = Post.from({ id, author: anAuthor() });

      expect(post.author.id).toEqual(authorId);
    });

    it('turns a bare primary key into a reference, like the docs prescribe', () => {
      const post = Post.from({ id, author: authorId as never });

      expect(post.author.id).toEqual(authorId);
      expect(post.author.isInitialized()).toBe(false);
    });

    it('leaves the collections to the ORM', () => {
      const post = Post.from({ id, tags: [tag()] as never });

      expect(post.tags.isInitialized()).toBe(true);
      expect(post.tags.count()).toBe(0);
    });

    it('validate accepts the state a created post lands in', () => {
      expect(() => aPost().validate()).not.toThrow();
    });

    it('validate rejects an updatedAt older than createdAt', () => {
      const post = aPost();
      post.updatedAt = new Date('2026-09-08T11:00:00.000Z');

      expect(() => post.validate()).toThrow(InvalidPostException);
      expect(issuesOf(() => post.validate())).toContain(
        'updatedAt cannot precede createdAt',
      );
    });

    it('validate rejects a version below one', () => {
      const post = aPost();
      post.version = 0;

      expect(() => post.validate()).toThrow(InvalidPostException);
    });

    it('every applied event is validated, so a broken transition throws', () => {
      const post = aPost();

      expect(() =>
        post.apply(
          new PostUpdatedEvent(
            id.value,
            'outro title',
            'outro content',
            authorId.value,
            'manuel',
            [],
            0,
            now,
            later,
          ),
        ),
      ).toThrow(InvalidPostException);
    });

    it('equals compares by identity, not by reference', () => {
      const post = aPost();
      const same = Post.from({
        id,
        title: post.title,
        content: post.content,
        createdAt: now,
        updatedAt: now,
        version: 1,
      });

      expect(post.equals(same)).toBe(true);
      expect(post.equals(Post.from({ id: PostId.generate() }))).toBe(false);
      expect(post.equals(null)).toBe(false);
    });
  });
});
