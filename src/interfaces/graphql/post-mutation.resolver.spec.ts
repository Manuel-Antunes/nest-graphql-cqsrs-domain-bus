import { createMapper, type Mapper } from '@automapper/core';
import type { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreatePostCommand } from '../../application/post/command/create-post.command';
import { UpdatePostCommand } from '../../application/post/command/update-post.command';
import { FindPostQuery } from '../../application/post/query/find-post.query';
import { PostRequest } from '../../application/shared/post-request';
import { PostNotFoundException } from '../../domain/post/exception/post-not-found.exception';
import type { Post } from '../../domain/post/post.entity';
import { PostId } from '../../domain/post/vo/post-id';
import { Author } from '../../domain/user/author.entity';
import { AUTHOR_ROLE } from '../../domain/user/user.entity';
import { UserId } from '../../domain/user/vo/user-id';
import type { CreatePostInput } from '../../dto/graphql/create-post.input';
import { PostProfile } from '../mapper/post.profile';
import { validatedDtoClasses } from '../mapper/validated-dto.strategy';
import { PostMutationResolver } from './post-mutation.resolver';

/**
 * A borda de escrita, isolada dos dois buses.
 *
 * O `updatePost` encolheu para nada: o command chega pronto no parâmetro, montado pelo `MapPipe`, e
 * quem prende aquela tradução é o `PostProfile`. O `createPost` **não** pôde encolher, e a razão é o
 * que a metade de cima deste arquivo testa: o command precisa do autor, o autor vem da sessão, e um
 * pipe não alcança o `ExecutionContext`. Então ali o mapeamento é uma chamada explícita, com o autor
 * entrando por `extraArgs`.
 *
 * O mapper aqui é **de verdade**, e não um duplo: o que se afirma é a costura entre o `extraArgs` que
 * o resolver passa e o `mapWithArguments` que o perfil declara. Um duplo confirmaria que o resolver
 * chama o mapper, que é justamente a parte que não pode quebrar sozinha.
 *
 * O resto é o que só este resolver faz:
 *
 * 1. **A `PostRequest` que abre a cadeia causal.** O segundo argumento do `commandBus.execute` carrega
 *    o `PostId` do próprio command, e é por ele que a saga recebe o id como value object em vez de
 *    reconstruí-lo do payload do evento. Um `execute` sem esse contexto compila, passa no e2e feliz, e
 *    quebra a saga.
 * 2. **A leitura de volta.** As duas mutations devolvem o post já gravado, lido pelo `QueryBus`. Se ele
 *    não estiver lá, isso não é `null` — é `PostNotFoundException`, porque o command acabou de dizer
 *    que salvou.
 *
 * Repare no que o resolver devolve: o **agregado**. A `PostView` é trabalho do interceptor, e testá-la
 * aqui seria testar o AutoMapper por interposta pessoa.
 */
describe('PostMutationResolver', () => {
  const postId = PostId.parse('0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10');
  const authorId = UserId.parse('9f1d1f36-7c2e-4a0a-9b7d-2f5c1a3e4b60');
  const now = new Date('2026-09-08T12:00:00.000Z');

  let mapper: Mapper;

  beforeEach(async () => {
    mapper = createMapper({ strategyInitializer: validatedDtoClasses() });
    new PostProfile(mapper);
    // O `AutomapperProfile` registra o perfil numa microtask — ver o construtor dele.
    await Promise.resolve();
  });

  afterEach(() => mapper.dispose());

  const anAuthor = (): Author =>
    Author.register(authorId, { email: 'manuel@example.com', name: 'manuel' }, AUTHOR_ROLE, now);

  /** O input chega cru: o @nestjs/graphql não instancia a classe do `@InputType`. */
  const anInput = (overrides: Record<string, unknown> = {}) =>
    ({ title: '  Nest + GraphQL  ', content: 'oi', ...overrides }) as unknown as CreatePostInput;

  const anUpdateCommand = () => new UpdatePostCommand.UpdatePost(postId, 'editado');

  /**
   * O fixture: os dois buses gravam o que receberam. O `commandBus` devolve o `postId` do command,
   * como o handler de verdade faz; o `queryBus` devolve o que o teste combinar.
   */
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
      // Arrange
      const { resolver, commands } = fixture();

      // Act
      await resolver.createPost(anInput(), anAuthor());

      // Assert
      const command = commands[0].command as CreatePostCommand.CreatePost;
      expect(command).toBeInstanceOf(CreatePostCommand.CreatePost);
      // O value object normaliza na travessia: o `trim` é do schema do `PostTitle`.
      expect(command.title).toBe('Nest + GraphQL');
      expect(command.content).toBe('oi');
      expect(command.authorId.equals(authorId)).toBe(true);
      expect(command.authorName.value).toBe('manuel');
    });

    /**
     * O autor não tem campo no `CreatePostInput`, e esta é a razão: quem escreve é quem está
     * autenticado, não quem se declara. Mandar um autor no corpo não muda o command.
     */
    it('ignora um autor forjado no corpo da requisição', async () => {
      // Arrange
      const { resolver, commands } = fixture();
      const forjado = anInput({ authorId: UserId.generate().value, authorName: 'outra pessoa' });

      // Act
      await resolver.createPost(forjado, anAuthor());

      // Assert
      const command = commands[0].command as CreatePostCommand.CreatePost;
      expect(command.authorId.equals(authorId)).toBe(true);
      expect(command.authorName.value).toBe('manuel');
    });

    it('gera um postId novo a cada chamada', async () => {
      // Arrange
      const { resolver, commands } = fixture();

      // Act
      await resolver.createPost(anInput(), anAuthor());
      await resolver.createPost(anInput(), anAuthor());

      // Assert
      const [first, second] = commands.map((c) => c.command.postId as PostId);
      expect(first.equals(second)).toBe(false);
    });

    /**
     * A borda é onde a request nasce: a chave da `PostRequest` é o `PostId` que o mapeamento acabou de
     * gerar — o mesmo que vai no command. É isso que a saga recebe como metadado.
     */
    it('abre a PostRequest com o id do post que está sendo criado', async () => {
      // Arrange
      const { resolver, commands } = fixture();

      // Act
      await resolver.createPost(anInput(), anAuthor());

      // Assert
      const { command, context } = commands[0];
      expect(context).toBeInstanceOf(PostRequest);
      expect((context as PostRequest).postId.equals(command.postId)).toBe(true);
    });

    it('devolve o post já gravado, lido de volta pelo QueryBus', async () => {
      // Arrange
      const { resolver, queries, found } = fixture();

      // Act
      const post = await resolver.createPost(anInput(), anAuthor());

      // Assert
      expect(queries).toHaveLength(1);
      expect(queries[0]).toBeInstanceOf(FindPostQuery.FindPost);
      expect(post).toBe(found);
    });

    /**
     * O command acabou de dizer que salvou. Não achar o post agora é uma inconsistência, e o resolver
     * a trata como tal — não como um `null` que o cliente teria de interpretar.
     */
    it('se o post gravado não é encontrado, isso é erro e não null', async () => {
      // Arrange
      const { resolver } = fixture(null);

      // Act / Assert
      await expect(resolver.createPost(anInput(), anAuthor())).rejects.toThrow(PostNotFoundException);
    });
  });

  describe('updatePost', () => {
    it('despacha o command que o MapPipe montou, sem tocá-lo', async () => {
      // Arrange
      const { resolver, commands } = fixture();
      const command = anUpdateCommand();

      // Act
      await resolver.updatePost(command, anAuthor());

      // Assert
      expect(commands[0].command).toBe(command);
    });

    it('a PostRequest do update é a do post informado', async () => {
      // Arrange
      const { resolver, commands } = fixture();

      // Act
      await resolver.updatePost(anUpdateCommand(), anAuthor());

      // Assert
      expect((commands[0].context as PostRequest).postId.equals(postId)).toBe(true);
    });

    it('devolve o post relido depois da escrita', async () => {
      // Arrange
      const { resolver, queries, found } = fixture();

      // Act
      const post = await resolver.updatePost(anUpdateCommand(), anAuthor());

      // Assert
      expect((queries[0] as FindPostQuery.FindPost).postId.equals(postId)).toBe(true);
      expect(post).toBe(found);
    });

    it('se o post não existe mais, isso é erro e não null', async () => {
      // Arrange
      const { resolver } = fixture(null);

      // Act / Assert
      await expect(resolver.updatePost(anUpdateCommand(), anAuthor())).rejects.toThrow(
        PostNotFoundException,
      );
    });
  });
});
