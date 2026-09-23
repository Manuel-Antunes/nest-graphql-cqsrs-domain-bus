import type { Mapper } from '@automapper/core';
import { createMapper } from '@automapper/core';
import { MikroORM } from '@mikro-orm/core';
import { closeTestDatabase, testDatabase } from '@nestposts/database/testing';
import type { DelegatedRef } from '@nestposts/platform/domain/shared/delegation/delegate';
import { delegateRef } from '@nestposts/platform/domain/shared/delegation/delegate';
import { PostCreatedEvent } from '@nestposts/posts/domain/post/event/post-created.event';
import { PostPreCreatedEvent } from '@nestposts/posts/domain/post/event/post-pre-created.event';
import { PostUpdatedEvent } from '@nestposts/posts/domain/post/event/post-updated.event';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { PostTitle } from '@nestposts/posts/domain/post/vo/post-title';
import { Tag } from '@nestposts/posts/domain/tag/tag.entity';
import { TagId } from '@nestposts/posts/domain/tag/vo/tag-id';
import { PostEntitySchema } from '@nestposts/posts/infrastructure/persistence/entities/post-orm.entity';
import { TagSchema } from '@nestposts/posts/infrastructure/persistence/entities/tag-orm.entity';
import {
  AUTHOR_ROLE,
  Author,
  Authorship,
} from '@nestposts/users/domain/user/author.entity';
import { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { UserName } from '@nestposts/users/domain/user/vo/user-name';
import {
  AuthorshipEntitySchema,
  UserEntitySchema,
} from '@nestposts/users/infrastructure/persistence/entities/user-orm.entity';

import { CreatePostCommand } from '../../application/post/command/create-post.command';
import { UpdatePostCommand } from '../../application/post/command/update-post.command';
import { CreatePostInput } from '../../dto/graphql/create-post.input';
import { PostView } from '../../dto/graphql/post.view';
import { TagView } from '../../dto/graphql/tag.view';
import { UpdatePostInput } from '../../dto/graphql/update-post.input';
import { PostProfile } from './post.profile';
import { validatedDtoClasses } from './validated-dto.strategy';

describe('PostProfile', () => {
  let orm: MikroORM;
  let mapper: Mapper;

  const postId = PostId.parse('0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10');
  const authorId = UserId.parse('9f1d1f36-7c2e-4a0a-9b7d-2f5c1a3e4b60');
  const tagId = TagId.parse('3a5c9e20-1d4b-4f88-8c1e-7b2d6a0f9e33');
  const createdAt = new Date('2024-01-01T10:00:00.000Z');
  const updatedAt = new Date('2024-01-02T10:00:00.000Z');

  beforeAll(async () => {
    orm = await testDatabase({
      entities: [
        PostEntitySchema,
        TagSchema,
        UserEntitySchema,
        AuthorshipEntitySchema,
      ],
    });
  });

  afterAll(() => closeTestDatabase(orm));

  beforeEach(async () => {
    mapper = createMapper({ strategyInitializer: validatedDtoClasses() });
    new PostProfile(mapper);
    await Promise.resolve();
  });

  afterEach(() => mapper.dispose());

  const anAuthor = (): Author => {
    const user = User.register(
      authorId,
      { email: 'manuel@example.com', name: 'Manuel' },
      [AUTHOR_ROLE],
      createdAt,
    );
    return Author.cast(user, Authorship.of(user));
  };

  const authorRef = (): DelegatedRef<Authorship, Author> =>
    delegateRef(Author, anAuthor().authorship);

  const aTag = (): Tag => Tag.create(tagId, 'nestjs', createdAt);

  const aPost = (): Post => {
    const post = Post.create(
      postId,
      { title: 'Nest + GraphQL', content: 'corpo do post' },
      authorRef(),
      UserName.parse('Manuel'),
      createdAt,
    );
    post.assignTag(aTag(), updatedAt);
    return post;
  };

  describe('Post → PostView', () => {
    it('traduz a entidade inteira, com o autor reduzido a id e as tags como views', () => {
      const view = mapper.map(aPost(), Post, PostView);

      expect(view).toBeInstanceOf(PostView);
      expect(view.id.equals(postId)).toBe(true);
      expect(view.title.value).toBe('Nest + GraphQL');
      expect(view.content.value).toBe('corpo do post');
      expect(view.authorId.equals(authorId)).toBe(true);
      expect(view.createdAt).toEqual(createdAt);
      expect(view.updatedAt).toEqual(updatedAt);
      expect(view.version).toBe(2);
      expect(view.tags).toHaveLength(1);
      expect(view.tags[0]).toBeInstanceOf(TagView);
      expect(view.tags[0].name.value).toBe('nestjs');
    });

    it('preserva os value objects como value objects — a view não achata para texto', () => {
      const view = mapper.map(aPost(), Post, PostView);

      expect(view.title).toBeInstanceOf(PostTitle);
      expect(view.id).toBeInstanceOf(PostId);
      expect(view.authorId).toBeInstanceOf(UserId);
    });
  });

  describe('PostPreCreatedEvent → PostView', () => {
    it('monta a view do payload: v1, sem tags, com createdAt = updatedAt', () => {
      const event = new PostPreCreatedEvent(
        postId.value,
        'Nest + GraphQL',
        'corpo do post',
        authorId.value,
        'Manuel',
        createdAt,
      );

      const view = mapper.map(event, PostPreCreatedEvent, PostView);

      expect(view.id.equals(postId)).toBe(true);
      expect(view.title).toBeInstanceOf(PostTitle);
      expect(view.title.value).toBe('Nest + GraphQL');
      expect(view.content.value).toBe('corpo do post');
      expect(view.authorId).toBeInstanceOf(UserId);
      expect(view.authorId.equals(authorId)).toBe(true);
      expect(view.createdAt).toEqual(createdAt);
      expect(view.updatedAt).toEqual(createdAt);
      expect(view.version).toBe(1);
      expect(view.tags).toEqual([]);
    });

    it('dá um array de tags novo a cada view — duas subscriptions não dividem a mesma lista', () => {
      const event = new PostPreCreatedEvent(
        postId.value,
        't',
        'c',
        authorId.value,
        'Manuel',
        createdAt,
      );

      const first = mapper.map(event, PostPreCreatedEvent, PostView);
      const second = mapper.map(event, PostPreCreatedEvent, PostView);

      expect(first.tags).not.toBe(second.tags);
    });
  });

  describe('PostCreatedEvent → PostView', () => {
    it('monta a view do post COMPLETO: v2, com a primeira tag', () => {
      const event = new PostCreatedEvent(
        postId.value,
        'Nest + GraphQL',
        'corpo do post',
        authorId.value,
        [{ tagId: tagId.value, name: 'Untagged' }],
        2,
        createdAt,
      );

      const view = mapper.map(event, PostCreatedEvent, PostView);

      expect(view.id.equals(postId)).toBe(true);
      expect(view.version).toBe(2);
      expect(view.createdAt).toEqual(createdAt);
      expect(view.updatedAt).toEqual(createdAt);
      expect(view.tags).toHaveLength(1);
      expect(view.tags[0].name.value).toBe('Untagged');
    });
  });

  describe('PostUpdatedEvent → PostView', () => {
    it('monta a view do payload, com as tags que vieram no evento', () => {
      const event = new PostUpdatedEvent(
        postId.value,
        'editado',
        'corpo editado',
        authorId.value,
        'Manuel',
        [{ tagId: tagId.value, name: 'nestjs' }],
        3,
        createdAt,
        updatedAt,
      );

      const view = mapper.map(event, PostUpdatedEvent, PostView);

      expect(view.id.equals(postId)).toBe(true);
      expect(view.title.value).toBe('editado');
      expect(view.content.value).toBe('corpo editado');
      expect(view.authorId.equals(authorId)).toBe(true);
      expect(view.createdAt).toEqual(createdAt);
      expect(view.updatedAt).toEqual(updatedAt);
      expect(view.version).toBe(3);
      expect(view.tags).toHaveLength(1);
      expect(view.tags[0].id).toBeInstanceOf(TagId);
      expect(view.tags[0].name.value).toBe('nestjs');
    });
  });

  describe('CreatePostInput → CreatePost', () => {
    it('monta o command a partir do objeto cru, com o autor vindo de extraArgs', () => {
      const author = anAuthor();

      const command = mapper.map(
        {
          title: '  Nest + GraphQL  ',
          content: 'corpo do post',
        } as unknown as CreatePostInput,
        CreatePostInput,
        CreatePostCommand.CreatePost,
        { extraArgs: () => ({ author }) },
      );

      expect(command).toBeInstanceOf(CreatePostCommand.CreatePost);
      expect(command.postId).toBeInstanceOf(PostId);
      expect(command.title).toBe('Nest + GraphQL');
      expect(command.content).toBe('corpo do post');
      expect(command.authorId.equals(authorId)).toBe(true);
      expect(command.authorName.value).toBe('Manuel');
    });

    it('gera um postId novo por command', () => {
      const author = anAuthor();
      const input = { title: 't', content: 'c' } as unknown as CreatePostInput;
      const options = { extraArgs: () => ({ author }) };

      const first = mapper.map(
        input,
        CreatePostInput,
        CreatePostCommand.CreatePost,
        options,
      );
      const second = mapper.map(
        input,
        CreatePostInput,
        CreatePostCommand.CreatePost,
        options,
      );

      expect(first.postId.equals(second.postId)).toBe(false);
    });
  });

  describe('UpdatePostInput → UpdatePost', () => {
    it('traduz o id e desembrulha os value objects para texto', () => {
      const command = mapper.map(
        {
          id: postId.value,
          title: 'editado',
          content: 'corpo editado',
        } as unknown as UpdatePostInput,
        UpdatePostInput,
        UpdatePostCommand.UpdatePost,
      );

      expect(command.postId.equals(postId)).toBe(true);
      expect(command.title).toBe('editado');
      expect(command.content).toBe('corpo editado');
    });

    it('deixa passar os campos ausentes sem tentar desembrulhá-los', () => {
      const command = mapper.map(
        {
          id: postId.value,
          title: 'só o título',
        } as unknown as UpdatePostInput,
        UpdatePostInput,
        UpdatePostCommand.UpdatePost,
      );

      expect(command.title).toBe('só o título');
      expect(command.content ?? null).toBeNull();
    });

    it('recusa um id que não é UUID', () => {
      expect(() =>
        mapper.map(
          { id: 'não-é-uuid', title: 'x' } as unknown as UpdatePostInput,
          UpdatePostInput,
          UpdatePostCommand.UpdatePost,
        ),
      ).toThrow();
    });
  });
});
