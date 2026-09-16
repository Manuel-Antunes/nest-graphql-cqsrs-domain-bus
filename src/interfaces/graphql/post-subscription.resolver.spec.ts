import { Subject } from 'rxjs';
import { OnPostCreatedSubscription } from '../../application/post/subscription/on-post-created.subscription';
import { OnPostUpdatedSubscription } from '../../application/post/subscription/on-post-updated.subscription';
import type { SubscriptionBus } from '../../cqsrs';
import { PostCreatedEvent } from '../../domain/post/event/post-created.event';
import { PostUpdatedEvent } from '../../domain/post/event/post-updated.event';
import { PostId } from '../../domain/post/vo/post-id';
import { UserId } from '../../domain/user/vo/user-id';
import { PostSubscriptionResolver } from './post-subscription.resolver';

/**
 * A borda das subscriptions, com um `SubscriptionBus` de mentira.
 *
 * O resolver faz **uma** coisa, e é tradução: argumento → critério da subscription. A outra travessia
 * — evento → view — virou o `MapSubscriptionInterceptor`, e é lá que ela é testada; aqui o que sai do
 * iterador é o evento de domínio como o bus o entregou.
 *
 * O que ele deliberadamente **não** faz é filtrar — o filtro é o método da mensagem, na camada de
 * aplicação, e roda dentro do stream. Um `filter` que voltasse para cá seria avaliado por assinante e
 * obrigaria o transporte a peneirar o stream inteiro; por isso o teste do critério afirma o que foi
 * **pedido ao bus**, e não o que saiu do iterador.
 *
 * O outro ponto é o tipo de retorno: uma subscription não é uma promessa que resolve, é um stream que
 * abre. `onPostCreated()` devolve um async iterable **sem `await`** — e é isso que se verifica.
 */
describe('PostSubscriptionResolver', () => {
  const postId = PostId.parse('0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10');
  const authorId = UserId.parse('9f1d1f36-7c2e-4a0a-9b7d-2f5c1a3e4b60');
  const now = new Date('2026-09-08T12:00:00.000Z');

  /** Um bus que devolve um `Subject` por assinatura e guarda o que foi pedido. */
  const fixture = () => {
    const asked: unknown[] = [];
    const source = new Subject<unknown>();
    const bus = {
      subscribe: (subscription: unknown) => {
        asked.push(subscription);
        return source.asObservable();
      },
    } as unknown as SubscriptionBus;
    return { resolver: new PostSubscriptionResolver(bus), asked, source };
  };

  const created = () => new PostCreatedEvent(postId.value, 'nasceu', 'oi', authorId.value, 'manuel', now);
  const updated = (version = 2) =>
    new PostUpdatedEvent(postId.value, 'editado', 'novo', authorId.value, 'manuel', [], version, now, now);

  describe('onPostCreated', () => {
    it('pede ao bus a subscription sem critério, e não espera nada', () => {
      // Arrange
      const { resolver, asked } = fixture();

      // Act
      const stream = resolver.onPostCreated();

      // Assert — o retorno é o stream em si, não uma Promise dele
      expect(stream[Symbol.asyncIterator]).toBeTypeOf('function');
      expect(asked[0]).toBeInstanceOf(OnPostCreatedSubscription.OnPostCreated);
    });

    /** O que sai é o evento; quem o traduz em `PostView` é o interceptor declarado no método. */
    it('entrega o PostCreated que passou pelo bus', async () => {
      // Arrange
      const { resolver, source } = fixture();
      const stream = resolver.onPostCreated();
      const first = stream[Symbol.asyncIterator]().next();
      const event = created();

      // Act
      source.next(event);
      const { value } = await first;

      // Assert
      expect(value).toBe(event);
    });
  });

  describe('onPostUpdated', () => {
    it('monta o critério com o postId do protocolo', () => {
      // Arrange
      const { resolver, asked } = fixture();

      // Act
      resolver.onPostUpdated(postId.value);

      // Assert
      expect(asked[0]).toBeInstanceOf(OnPostUpdatedSubscription.OnPostUpdated);
      expect((asked[0] as OnPostUpdatedSubscription.OnPostUpdated).criteria).toEqual({ postId: postId.value });
    });

    /** `postId` é `nullable` no schema: ausente quer dizer "todos os posts", e o critério diz isso. */
    it('sem postId, o critério é o de todos os posts', () => {
      // Arrange
      const { resolver, asked } = fixture();

      // Act
      resolver.onPostUpdated();
      resolver.onPostUpdated(null);

      // Assert
      expect((asked[0] as OnPostUpdatedSubscription.OnPostUpdated).criteria).toEqual({ postId: undefined });
      expect((asked[1] as OnPostUpdatedSubscription.OnPostUpdated).criteria).toEqual({ postId: null });
    });

    it('entrega o PostUpdated que passou pelo bus', async () => {
      // Arrange
      const { resolver, source } = fixture();
      const stream = resolver.onPostUpdated(postId.value);
      const first = stream[Symbol.asyncIterator]().next();
      const event = updated(4);

      // Act
      source.next(event);
      const { value } = await first;

      // Assert
      expect(value).toBe(event);
    });

    /**
     * O resolver não peneira: quem recorta é o `match` da mensagem, aplicado pelo bus. Um evento que
     * o bus entregou é um evento que o assinante deve ver — inclusive um de outro post, se o bus o
     * tiver deixado passar.
     */
    it('não filtra por conta própria: entrega o que o bus mandou', async () => {
      // Arrange
      const { resolver, source } = fixture();
      const outroPost = PostId.generate();
      const stream = resolver.onPostUpdated(postId.value);
      const first = stream[Symbol.asyncIterator]().next();

      // Act
      source.next(
        new PostUpdatedEvent(outroPost.value, 't', 'c', authorId.value, 'manuel', [], 2, now, now),
      );
      const { value } = await first;

      // Assert
      expect((value as PostUpdatedEvent).postId).toBe(outroPost.value);
    });

    it('quando o cliente vai embora, o iterador fecha e larga o stream', async () => {
      // Arrange
      const { resolver, source } = fixture();
      const stream = resolver.onPostUpdated();
      const iterator = stream[Symbol.asyncIterator]();
      const pending = iterator.next();
      expect(source.observed).toBe(true);

      // Act
      await iterator.return?.();

      // Assert
      expect(await pending).toEqual({ value: undefined, done: true });
      expect(source.observed).toBe(false);
    });
  });
});
