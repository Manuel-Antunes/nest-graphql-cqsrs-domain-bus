import type { QueryBus } from '@nestjs/cqrs';
import { FindAllPostsQuery } from '../../application/post/query/find-all-posts.query';
import { FindPostQuery } from '../../application/post/query/find-post.query';
import type { Post } from '../../domain/post/post.entity';
import { PostId } from '../../domain/post/vo/post-id';
import { PostQueryResolver } from './post-query.resolver';

/**
 * A borda de leitura, isolada: nem banco nem GraphQL, e agora nem mapper.
 *
 * O que sobrou deste resolver é **um** sentido de tradução — argumento do protocolo → mensagem do
 * `QueryBus` (`id: string` → `FindPost(PostId)`) — e é só isso que se afirma aqui. O outro sentido
 * virou interceptor: a `PostView` sai do `PostProfile`, e a cursor connection do
 * `ConnectionInterceptor`, que tem os testes que antes moravam neste arquivo.
 *
 * A divisão não é de arrumação. Enquanto o resolver montava a connection, os testes dos cursores
 * valiam para `Query.posts` e alguém tinha de lembrar de repeti-los em `Author.posts`; agora eles
 * valem para o interceptor, que é o que as duas usam.
 */
describe('PostQueryResolver', () => {
  const id = PostId.parse('0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10');

  /** O que o `FindPost` devolve é a entidade; aqui só interessa que ela atravesse intacta. */
  const aPost = (postId = id) => ({ postId }) as unknown as Post;

  /** Um `QueryBus` que grava o que foi despachado e devolve o que o teste combinar. */
  const resolverOn = (result: unknown) => {
    const dispatched: unknown[] = [];
    const bus = {
      execute: (query: unknown) => {
        dispatched.push(query);
        return Promise.resolve(result);
      },
    } as unknown as QueryBus;
    return { resolver: new PostQueryResolver(bus), dispatched };
  };

  describe('post(id)', () => {
    it('traduz o id do protocolo em FindPost com o value object', async () => {
      // Arrange
      const { resolver, dispatched } = resolverOn(aPost());

      // Act
      await resolver.post(id.value);

      // Assert
      expect(dispatched).toHaveLength(1);
      expect(dispatched[0]).toBeInstanceOf(FindPostQuery.FindPost);
      expect((dispatched[0] as FindPostQuery.FindPost).postId.equals(id)).toBe(true);
    });

    it('devolve o agregado que o handler achou, sem tocá-lo', async () => {
      // Arrange
      const post = aPost();
      const { resolver } = resolverOn(post);

      // Act
      const result = await resolver.post(id.value);

      // Assert
      expect(result).toBe(post);
    });

    /**
     * `post(id)` é `nullable` no schema: não achar não é erro, é `null`. O `null` continua sendo
     * `null` depois do interceptor — o AutoMapper devolve nulo para origem nula.
     */
    it('um post que não existe vira null', async () => {
      // Arrange
      const { resolver } = resolverOn(null);

      // Act
      const result = await resolver.post(id.value);

      // Assert
      expect(result).toBeNull();
    });

    it('um id que não é UUID é recusado antes de virar mensagem', async () => {
      // Arrange
      const { resolver, dispatched } = resolverOn(aPost());

      // Act / Assert
      await expect(resolver.post('nem-uuid')).rejects.toThrow();
      expect(dispatched).toEqual([]);
    });
  });

  describe('posts(first, after)', () => {
    /**
     * O resolver repassa os argumentos como vieram; quem preenche o tamanho padrão é a **mensagem**
     * (`FindAllPosts`), não a borda. É o que mantém o default igual para qualquer transporte que
     * despache a mesma query.
     */
    it('repassa first e after como vieram, e o default de página é da mensagem', async () => {
      // Arrange
      const { resolver, dispatched } = resolverOn({ items: [] });

      // Act
      await resolver.posts(2, 'cursor-anterior');
      await resolver.posts();

      // Assert
      expect(dispatched[0]).toBeInstanceOf(FindAllPostsQuery.FindAllPosts);
      expect(dispatched[0]).toMatchObject({ first: 2, after: 'cursor-anterior' });
      expect(dispatched[1]).toMatchObject({ first: 20, after: undefined });
    });

    /** A página sai daqui como o ORM a produziu — quem a envelopa é o `ConnectionInterceptor`. */
    it('devolve o Cursor do ORM, sem montar connection nenhuma', async () => {
      // Arrange
      const page = { items: [aPost()] };
      const { resolver } = resolverOn(page);

      // Act
      const result = await resolver.posts();

      // Assert
      expect(result).toBe(page);
    });
  });
});
