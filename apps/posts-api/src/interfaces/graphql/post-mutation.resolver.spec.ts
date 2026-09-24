import type { Mapper } from '@automapper/core';
import { createMapper } from '@automapper/core';
import { MikroORM } from '@mikro-orm/core';
import type { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ROOT_TENANT } from '@nestposts/database';
import { closeTestDatabase, testDatabase } from '@nestposts/database/testing';
import { PostNotFoundException } from '@nestposts/posts/domain/post/exception/post-not-found.exception';
import type { Post } from '@nestposts/posts/domain/post/post.entity';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { PostEntitySchema } from '@nestposts/posts/infrastructure/persistence/entities/post-orm.entity';
import { TagSchema } from '@nestposts/posts/infrastructure/persistence/entities/tag-orm.entity';
import {
  AUTHOR_ROLE,
  Author,
  Authorship,
} from '@nestposts/users/domain/user/author.entity';
import { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import {
  AuthorshipEntitySchema,
  UserEntitySchema,
} from '@nestposts/users/infrastructure/persistence/entities/user-orm.entity';

import { CreatePostCommand } from '../../application/post/command/create-post.command';
import { DeletePostCommand } from '../../application/post/command/delete-post.command';
import { UpdatePostCommand } from '../../application/post/command/update-post.command';
import { FindPostQuery } from '../../application/post/query/find-post.query';
import { PostRequest } from '../../application/shared/post-request';
import type { CreatePostInput } from '../../dto/graphql/create-post.input';
import type { UpdatePostInput } from '../../dto/graphql/update-post.input';
import { PostProfile } from '../mapper/post.profile';
import { validatedDtoClasses } from '../mapper/validated-dto.strategy';
import { PostMutationResolver } from './post-mutation.resolver';

describe('PostMutationResolver', () => {
  const postId = PostId.parse('0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10');
  const authorId = UserId.parse('9f1d1f36-7c2e-4a0a-9b7d-2f5c1a3e4b60');
  const now = new Date('2026-09-08T12:00:00.000Z');

  let mapper: Mapper;

  let orm: MikroORM;

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
      { email: 'manuel@example.com', name: 'manuel' },
      [AUTHOR_ROLE],
      now,
    );
    return Author.cast(user, Authorship.of(user));
  };

  const anInput = (overrides: Record<string, unknown> = {}) =>
    ({
      title: '  Nest + GraphQL  ',
      content: 'oi',
      ...overrides,
    }) as unknown as CreatePostInput;

  const anUpdateInput = (overrides: Record<string, unknown> = {}) =>
    ({
      id: postId,
      title: 'editado',
      ...overrides,
    }) as unknown as UpdatePostInput;

  const anUpload = {
    name: `tmp/${authorId.value}/1-upload`,
    size: 4,
    extname: 'png',
    mimeType: 'image/png',
  };

  const fixture = (found: Post | null = {} as Post) => {
    // biome-ignore lint/suspicious/noExplicitAny: resolve command
    const commands: Array<{ command: any; context: unknown }> = [];
    const queries: unknown[] = [];
    const commandBus = {
      // biome-ignore lint/suspicious/noExplicitAny: resolve command
      execute: (command: any, context: unknown) => {
        commands.push({ command, context });
        return Promise.resolve(command.postId);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: (query: unknown) => {
        queries.push(query);
        return Promise.resolve(found);
      },
    } as unknown as QueryBus;
    return {
      resolver: new PostMutationResolver(commandBus, queryBus, mapper),
      commands,
      queries,
      found,
    };
  };

  describe('createPost', () => {
    it('monta o command com o que veio no input e o autor da sessão', async () => {
      const { resolver, commands } = fixture();

      await resolver.createPost(anInput(), anAuthor(), ROOT_TENANT);

      const command = commands[0].command as CreatePostCommand.CreatePost;
      expect(command).toBeInstanceOf(CreatePostCommand.CreatePost);
      expect(command.title).toBe('Nest + GraphQL');
      expect(command.content).toBe('oi');
      expect(command.authorId.equals(authorId)).toBe(true);
      expect(command.authorName.value).toBe('manuel');
    });

    it('ignora um autor forjado no corpo da requisição', async () => {
      const { resolver, commands } = fixture();
      const forjado = anInput({
        authorId: UserId.generate().value,
        authorName: 'outra pessoa',
      });

      await resolver.createPost(forjado, anAuthor(), ROOT_TENANT);

      const command = commands[0].command as CreatePostCommand.CreatePost;
      expect(command.authorId.equals(authorId)).toBe(true);
      expect(command.authorName.value).toBe('manuel');
    });

    it('leva o tenant da requisição para dentro da PostRequest, que é o que atravessa o broker', async () => {
      const { resolver, commands } = fixture();

      await resolver.createPost(anInput(), anAuthor(), 'acme');

      const request = commands[0].context as PostRequest;
      expect(request).toBeInstanceOf(PostRequest);
      expect(request.tenantId).toBe('acme');
      expect(request.toAttributes()['x-tenant']).toBe('acme');
    });

    it('gera um postId novo a cada chamada', async () => {
      const { resolver, commands } = fixture();

      await resolver.createPost(anInput(), anAuthor(), ROOT_TENANT);
      await resolver.createPost(anInput(), anAuthor(), ROOT_TENANT);

      const [first, second] = commands.map((c) => c.command.postId as PostId);
      expect(first.equals(second)).toBe(false);
    });

    it('abre a PostRequest com o id do post que está sendo criado', async () => {
      const { resolver, commands } = fixture();

      await resolver.createPost(anInput(), anAuthor(), ROOT_TENANT);

      const { command, context } = commands[0];
      expect(context).toBeInstanceOf(PostRequest);
      expect((context as PostRequest).postId.equals(command.postId)).toBe(true);
    });

    it('devolve o post já gravado, lido de volta pelo QueryBus', async () => {
      const { resolver, queries, found } = fixture();

      const post = await resolver.createPost(
        anInput(),
        anAuthor(),
        ROOT_TENANT,
      );

      expect(queries).toHaveLength(1);
      expect(queries[0]).toBeInstanceOf(FindPostQuery.FindPost);
      expect(post).toBe(found);
    });

    it('se o post gravado não é encontrado, isso é erro e não null', async () => {
      const { resolver } = fixture(null);

      await expect(
        resolver.createPost(anInput(), anAuthor(), ROOT_TENANT),
      ).rejects.toThrow(PostNotFoundException);
    });
  });

  describe('createPost with an attachment', () => {
    it('hands the upload to the command as it came', async () => {
      const { resolver, commands } = fixture();

      await resolver.createPost(
        anInput({ asset: anUpload }),
        anAuthor(),
        ROOT_TENANT,
      );

      const command = commands[0].command as CreatePostCommand.CreatePost;
      expect(command.asset).toEqual(anUpload);
    });

    it('leaves the command without one when the input has none', async () => {
      const { resolver, commands } = fixture();

      await resolver.createPost(anInput(), anAuthor(), ROOT_TENANT);

      expect(
        (commands[0].command as CreatePostCommand.CreatePost).asset,
      ).toBeNull();
    });
  });

  describe('deletePost', () => {
    it('dispatches DeletePost within the post’s own request', async () => {
      const { resolver, commands } = fixture();

      const answer = await resolver.deletePost(
        postId.value,
        anAuthor(),
        'acme',
      );

      expect(answer).toBe(true);
      const command = commands[0].command as DeletePostCommand.DeletePost;
      expect(command).toBeInstanceOf(DeletePostCommand.DeletePost);
      expect(command.postId.equals(postId)).toBe(true);
      const request = commands[0].context as PostRequest;
      expect(request.postId.equals(postId)).toBe(true);
      expect(request.tenantId).toBe('acme');
    });

    it('refuses an id that is not a post id before dispatching anything', async () => {
      const { resolver, commands } = fixture();

      await expect(
        resolver.deletePost('not-a-post', anAuthor(), ROOT_TENANT),
      ).rejects.toThrow();
      expect(commands).toHaveLength(0);
    });
  });

  describe('updatePost', () => {
    it('builds the command from the input, with the session author as the uploader', async () => {
      const { resolver, commands } = fixture();

      await resolver.updatePost(
        anUpdateInput({ asset: anUpload }),
        anAuthor(),
        ROOT_TENANT,
      );

      const command = commands[0].command as UpdatePostCommand.UpdatePost;
      expect(command).toBeInstanceOf(UpdatePostCommand.UpdatePost);
      expect(command.postId.equals(postId)).toBe(true);
      expect(command.title).toBe('editado');
      expect(command.asset).toEqual(anUpload);
      expect(command.editorId?.equals(authorId)).toBe(true);
    });

    it('a PostRequest do update é a do post informado', async () => {
      const { resolver, commands } = fixture();

      await resolver.updatePost(anUpdateInput(), anAuthor(), ROOT_TENANT);

      expect((commands[0].context as PostRequest).postId.equals(postId)).toBe(
        true,
      );
    });

    it('devolve o post relido depois da escrita', async () => {
      const { resolver, queries, found } = fixture();

      const post = await resolver.updatePost(
        anUpdateInput(),
        anAuthor(),
        ROOT_TENANT,
      );

      expect((queries[0] as FindPostQuery.FindPost).postId.equals(postId)).toBe(
        true,
      );
      expect(post).toBe(found);
    });

    it('se o post não existe mais, isso é erro e não null', async () => {
      const { resolver } = fixture(null);

      await expect(
        resolver.updatePost(anUpdateInput(), anAuthor(), ROOT_TENANT),
      ).rejects.toThrow(PostNotFoundException);
    });
  });
});
