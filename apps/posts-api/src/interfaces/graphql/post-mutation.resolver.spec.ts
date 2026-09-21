import { createMapper, type Mapper } from '@automapper/core';
import { MikroORM } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/sqlite';
import type { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreatePostCommand } from '../../application/post/command/create-post.command';
import { UpdatePostCommand } from '../../application/post/command/update-post.command';
import { FindPostQuery } from '../../application/post/query/find-post.query';
import { PostRequest } from '../../application/shared/post-request';
import { PostNotFoundException } from '@nestposts/posts/domain/post/exception/post-not-found.exception';
import type { Post } from '@nestposts/posts/domain/post/post.entity';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { AUTHOR_ROLE, Author, Authorship } from '@nestposts/users/domain/user/author.entity';
import { User } from '@nestposts/users/domain/user/user.entity';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import type { CreatePostInput } from '../../dto/graphql/create-post.input';
import { PostProfile } from '../mapper/post.profile';
import { validatedDtoClasses } from '../mapper/validated-dto.strategy';
import { PostEntitySchema } from '@nestposts/posts/infrastructure/persistence/entities/post-orm.entity';
import { TagSchema } from '@nestposts/posts/infrastructure/persistence/entities/tag-orm.entity';
import {
  AuthorshipEntitySchema,
  UserEntitySchema,
} from '@nestposts/users/infrastructure/persistence/entities/user-orm.entity';
import { PostMutationResolver } from './post-mutation.resolver';

describe('PostMutationResolver', () => {
  const postId = PostId.parse('0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10');
  const authorId = UserId.parse('9f1d1f36-7c2e-4a0a-9b7d-2f5c1a3e4b60');
  const now = new Date('2026-09-08T12:00:00.000Z');

  let mapper: Mapper;

  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init(
      defineConfig({
        dbName: ':memory:',
        entities: [PostEntitySchema, TagSchema, UserEntitySchema, AuthorshipEntitySchema],
      }),
    );
  });

  afterAll(() => orm.close());

  beforeEach(async () => {
    mapper = createMapper({ strategyInitializer: validatedDtoClasses() });
    new PostProfile(mapper);
    await Promise.resolve();
  });

  afterEach(() => mapper.dispose());

  const anAuthor = (): Author => {
    const user = User.register(authorId, { email: 'manuel@example.com', name: 'manuel' }, [AUTHOR_ROLE], now);
    return Author.cast(user, Authorship.of(user));
  };

  const anInput = (overrides: Record<string, unknown> = {}) =>
    ({ title: '  Nest + GraphQL  ', content: 'oi', ...overrides }) as unknown as CreatePostInput;

  const anUpdateCommand = () => new UpdatePostCommand.UpdatePost(postId, 'editado');

  const fixture = (found: Post | null = {} as Post) => {
    const commands: Array<{ command: any; context: unknown }> = [];
    const queries: unknown[] = [];
    const commandBus = {
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

      await resolver.createPost(anInput(), anAuthor());

      const command = commands[0].command as CreatePostCommand.CreatePost;
      expect(command).toBeInstanceOf(CreatePostCommand.CreatePost);
      expect(command.title).toBe('Nest + GraphQL');
      expect(command.content).toBe('oi');
      expect(command.authorId.equals(authorId)).toBe(true);
      expect(command.authorName.value).toBe('manuel');
    });

    it('ignora um autor forjado no corpo da requisição', async () => {
      const { resolver, commands } = fixture();
      const forjado = anInput({ authorId: UserId.generate().value, authorName: 'outra pessoa' });

      await resolver.createPost(forjado, anAuthor());

      const command = commands[0].command as CreatePostCommand.CreatePost;
      expect(command.authorId.equals(authorId)).toBe(true);
      expect(command.authorName.value).toBe('manuel');
    });

    it('gera um postId novo a cada chamada', async () => {
      const { resolver, commands } = fixture();

      await resolver.createPost(anInput(), anAuthor());
      await resolver.createPost(anInput(), anAuthor());

      const [first, second] = commands.map((c) => c.command.postId as PostId);
      expect(first.equals(second)).toBe(false);
    });

    it('abre a PostRequest com o id do post que está sendo criado', async () => {
      const { resolver, commands } = fixture();

      await resolver.createPost(anInput(), anAuthor());

      const { command, context } = commands[0];
      expect(context).toBeInstanceOf(PostRequest);
      expect((context as PostRequest).postId.equals(command.postId)).toBe(true);
    });

    it('devolve o post já gravado, lido de volta pelo QueryBus', async () => {
      const { resolver, queries, found } = fixture();

      const post = await resolver.createPost(anInput(), anAuthor());

      expect(queries).toHaveLength(1);
      expect(queries[0]).toBeInstanceOf(FindPostQuery.FindPost);
      expect(post).toBe(found);
    });

    it('se o post gravado não é encontrado, isso é erro e não null', async () => {
      const { resolver } = fixture(null);

      await expect(resolver.createPost(anInput(), anAuthor())).rejects.toThrow(PostNotFoundException);
    });
  });

  describe('updatePost', () => {
    it('despacha o command que o MapPipe montou, sem tocá-lo', async () => {
      const { resolver, commands } = fixture();
      const command = anUpdateCommand();

      await resolver.updatePost(command, anAuthor());

      expect(commands[0].command).toBe(command);
    });

    it('a PostRequest do update é a do post informado', async () => {
      const { resolver, commands } = fixture();

      await resolver.updatePost(anUpdateCommand(), anAuthor());

      expect((commands[0].context as PostRequest).postId.equals(postId)).toBe(true);
    });

    it('devolve o post relido depois da escrita', async () => {
      const { resolver, queries, found } = fixture();

      const post = await resolver.updatePost(anUpdateCommand(), anAuthor());

      expect((queries[0] as FindPostQuery.FindPost).postId.equals(postId)).toBe(true);
      expect(post).toBe(found);
    });

    it('se o post não existe mais, isso é erro e não null', async () => {
      const { resolver } = fixture(null);

      await expect(resolver.updatePost(anUpdateCommand(), anAuthor())).rejects.toThrow(
        PostNotFoundException,
      );
    });
  });
});
