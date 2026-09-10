import type { CommandBus, QueryBus } from '@nestjs/cqrs';
import { MikroORM } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/sqlite';
import { CreatePostCommand } from '../../application/post/command/create-post.command';
import { UpdatePostCommand } from '../../application/post/command/update-post.command';
import { FindPostQuery } from '../../application/post/query/find-post.query';
import { PostRequest } from '../../application/shared/post-request';
import { PostNotFoundException } from '../../domain/post/exception/post-not-found.exception';
import type { Post } from '../../domain/post/post.entity';
import { PostId } from '../../domain/post/vo/post-id';
import type { Author } from '../../domain/user/author.entity';
import { AUTHOR_ROLE } from '../../domain/user/user.entity';
import { Users } from '../../domain/user/user.factory';
import { UserId } from '../../domain/user/vo/user-id';
import type { CreatePostInput } from '../../dto/graphql/create-post.input';
import { PostView } from '../../dto/graphql/post.view';
import type { UpdatePostInput } from '../../dto/graphql/update-post.input';
import { PostSchema } from '../../infrastructure/persistence/sqlite/entities/post-orm.entity';
import { TagSchema } from '../../infrastructure/persistence/sqlite/entities/tag-orm.entity';
import {
  AuthorSchema,
  ReaderSchema,
  UserSchema,
} from '../../infrastructure/persistence/sqlite/entities/user-orm.entity';
import { PostInputMapper } from '../mapper/post-input.mapper';
import { PostViewMapper } from '../mapper/post-view.mapper';
import { PostMutationResolver } from './post-mutation.resolver';

/**
 * A borda de escrita, isolada dos dois buses.
 *
 * O que este resolver acrescenta ao par mapper + bus é uma coisa só, e é ela que os testes prendem:
 * **a `PostRequest` que abre a cadeia causal**. O segundo argumento do `commandBus.execute` carrega o
 * `PostId` do próprio command — o gerado, no create; o informado, no update — e é por ele que a saga
 * recebe o id como value object em vez de reconstruí-lo do payload do evento. Um `execute` sem esse
 * contexto compila, passa no e2e feliz, e quebra a saga.
 *
 * O outro ponto é a leitura de volta: `createPost` devolve o post **já gravado**, lido pelo
 * `QueryBus`. Se ele não estiver lá, isso não é `null` — é `PostNotFoundException`, porque o command
 * acabou de dizer que salvou.
 */
describe('PostMutationResolver', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init(
      defineConfig({
        dbName: ':memory:',
        entities: [PostSchema, TagSchema, UserSchema, ReaderSchema, AuthorSchema],
      }),
    );
  });

  afterAll(() => orm.close());
  afterEach(() => vi.restoreAllMocks());

  const postId = PostId.parse('0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10');
  const authorId = UserId.parse('9f1d1f36-7c2e-4a0a-9b7d-2f5c1a3e4b60');

  const anAuthor = (): Author => {
    const user = Users.register(
      authorId,
      { email: 'manuel@example.com', name: 'manuel' },
      AUTHOR_ROLE,
      new Date('2026-09-08T12:00:00.000Z'),
    );
    if (!user.canWritePosts()) {
      throw new Error('AUTHOR_ROLE precisa nascer Author');
    }
    return user;
  };

  const aView = () =>
    new PostView({
      id: postId.value,
      title: 'um post',
      content: 'conteúdo',
      authorId: UserId.generate().value,
      createdAt: new Date('2026-09-08T12:00:00.000Z'),
      updatedAt: new Date('2026-09-08T12:00:00.000Z'),
      version: 1,
      tags: [],
    });

  /**
   * O fixture: os dois buses gravam o que receberam. O `commandBus` devolve o `postId` do command,
   * como o handler de verdade faz; o `queryBus` devolve o que o teste combinar.
   */
  const fixture = (found: Post | null = ({} as Post)) => {
    const commands: Array<{ command: unknown; context: unknown }> = [];
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
    const viewMapper = new PostViewMapper();
    vi.spyOn(viewMapper, 'fromPost').mockReturnValue(aView());
    return {
      resolver: new PostMutationResolver(commandBus, queryBus, new PostInputMapper(), viewMapper),
      commands,
      queries,
      viewMapper,
    };
  };

  const createInput = { title: 'Nest + GraphQL', content: 'oi' } as unknown as CreatePostInput;
  const updateInput = { id: postId.value, title: 'editado' } as unknown as UpdatePostInput;

  describe('createPost', () => {
    it('despacha CreatePost com o que o mapper montou', async () => {
      // Arrange
      const { resolver, commands } = fixture();

      // Act
      await resolver.createPost(createInput, anAuthor());

      // Assert
      expect(commands).toHaveLength(1);
      expect(commands[0].command).toBeInstanceOf(CreatePostCommand.CreatePost);
      expect(commands[0].command).toMatchObject({ title: 'Nest + GraphQL', content: 'oi' });
    });

    /**
     * A borda é onde a request nasce: a chave da `PostRequest` é o `PostId` que o mapper acabou de
     * gerar — o mesmo que vai no command. É isso que a saga recebe como metadado.
     */
    it('abre a PostRequest com o id do post que está sendo criado', async () => {
      // Arrange
      const { resolver, commands } = fixture();

      // Act
      await resolver.createPost(createInput, anAuthor());

      // Assert
      const { command, context } = commands[0];
      expect(context).toBeInstanceOf(PostRequest);
      expect((context as PostRequest).postId.equals((command as CreatePostCommand.CreatePost).postId)).toBe(true);
    });

    it('devolve o post já gravado, lido de volta pelo QueryBus', async () => {
      // Arrange
      const { resolver, queries, viewMapper } = fixture();

      // Act
      const view = await resolver.createPost(createInput, anAuthor());

      // Assert
      expect(queries).toHaveLength(1);
      expect(queries[0]).toBeInstanceOf(FindPostQuery.FindPost);
      expect(viewMapper.fromPost).toHaveBeenCalledOnce();
      expect(view).toBeInstanceOf(PostView);
    });

    it('o autor da mutation é o da sessão, não algo vindo do input', async () => {
      // Arrange
      const { resolver, commands } = fixture();

      // Act
      await resolver.createPost(createInput, anAuthor());

      // Assert
      const command = commands[0].command as CreatePostCommand.CreatePost;
      expect(command.authorId.equals(authorId)).toBe(true);
      expect(command.authorName.value).toBe('manuel');
    });

    /**
     * O command acabou de dizer que salvou. Não achar o post agora é uma inconsistência, e o resolver
     * a trata como tal — não como um `null` que o cliente teria de interpretar.
     */
    it('se o post gravado não é encontrado, isso é erro e não null', async () => {
      // Arrange
      const { resolver } = fixture(null);

      // Act / Assert
      await expect(resolver.createPost(createInput, anAuthor())).rejects.toThrow(PostNotFoundException);
    });
  });

  describe('updatePost', () => {
    it('despacha UpdatePost com o id informado pelo cliente', async () => {
      // Arrange
      const { resolver, commands } = fixture();

      // Act
      await resolver.updatePost(updateInput, anAuthor());

      // Assert
      expect(commands[0].command).toBeInstanceOf(UpdatePostCommand.UpdatePost);
      expect((commands[0].command as UpdatePostCommand.UpdatePost).postId.equals(postId)).toBe(true);
      expect(commands[0].command).toMatchObject({ title: 'editado', content: undefined });
    });

    it('a PostRequest do update é a do post informado', async () => {
      // Arrange
      const { resolver, commands } = fixture();

      // Act
      await resolver.updatePost(updateInput, anAuthor());

      // Assert
      expect((commands[0].context as PostRequest).postId.equals(postId)).toBe(true);
    });

    it('devolve o post relido depois da escrita', async () => {
      // Arrange
      const { resolver, queries } = fixture();

      // Act
      const view = await resolver.updatePost(updateInput, anAuthor());

      // Assert
      expect((queries[0] as FindPostQuery.FindPost).postId.equals(postId)).toBe(true);
      expect(view).toBeInstanceOf(PostView);
    });

    it('um id inválido não vira command nenhum', async () => {
      // Arrange
      const { resolver, commands } = fixture();

      // Act / Assert
      await expect(
        resolver.updatePost({ id: 'nem-uuid' } as unknown as UpdatePostInput, anAuthor()),
      ).rejects.toThrow();
      expect(commands).toEqual([]);
    });
  });
});
