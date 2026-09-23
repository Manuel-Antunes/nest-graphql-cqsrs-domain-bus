import type { SubscriptionBus } from '@nestposts/cqsrs';
import { PostCreatedEvent } from '@nestposts/posts/domain/post/event/post-created.event';
import { PostUpdatedEvent } from '@nestposts/posts/domain/post/event/post-updated.event';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { Subject } from 'rxjs';

import { OnPostCreatedSubscription } from '../../application/post/subscription/on-post-created.subscription';
import { OnPostUpdatedSubscription } from '../../application/post/subscription/on-post-updated.subscription';
import { PostSubscriptionResolver } from './post-subscription.resolver';

describe('PostSubscriptionResolver', () => {
  const postId = PostId.parse('0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10');
  const authorId = UserId.parse('9f1d1f36-7c2e-4a0a-9b7d-2f5c1a3e4b60');
  const now = new Date('2026-09-08T12:00:00.000Z');

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

  const created = () =>
    new PostCreatedEvent(
      postId.value,
      'completo',
      'oi',
      authorId.value,
      [],
      2,
      now,
    );
  const updated = (version = 2) =>
    new PostUpdatedEvent(
      postId.value,
      'editado',
      'novo',
      authorId.value,
      'manuel',
      [],
      version,
      now,
      now,
    );

  describe('onPostCreated', () => {
    it('pede ao bus a subscription sem critério, e não espera nada', () => {
      const { resolver, asked } = fixture();

      const stream = resolver.onPostCreated();

      expect(stream[Symbol.asyncIterator]).toBeTypeOf('function');
      expect(asked[0]).toBeInstanceOf(OnPostCreatedSubscription.OnPostCreated);
    });

    it('entrega o PostCreated que passou pelo bus', async () => {
      const { resolver, source } = fixture();
      const stream = resolver.onPostCreated();
      const first = stream[Symbol.asyncIterator]().next();
      const event = created();

      source.next(event);
      const { value } = await first;

      expect(value).toBe(event);
    });
  });

  describe('onPostUpdated', () => {
    it('monta o critério com o postId do protocolo', () => {
      const { resolver, asked } = fixture();

      resolver.onPostUpdated(postId.value);

      expect(asked[0]).toBeInstanceOf(OnPostUpdatedSubscription.OnPostUpdated);
      expect(
        (asked[0] as OnPostUpdatedSubscription.OnPostUpdated).criteria,
      ).toEqual({ postId: postId.value });
    });

    it('sem postId, o critério é o de todos os posts', () => {
      const { resolver, asked } = fixture();

      resolver.onPostUpdated();
      resolver.onPostUpdated(null);

      expect(
        (asked[0] as OnPostUpdatedSubscription.OnPostUpdated).criteria,
      ).toEqual({ postId: undefined });
      expect(
        (asked[1] as OnPostUpdatedSubscription.OnPostUpdated).criteria,
      ).toEqual({ postId: null });
    });

    it('entrega o PostUpdated que passou pelo bus', async () => {
      const { resolver, source } = fixture();
      const stream = resolver.onPostUpdated(postId.value);
      const first = stream[Symbol.asyncIterator]().next();
      const event = updated(4);

      source.next(event);
      const { value } = await first;

      expect(value).toBe(event);
    });

    it('não filtra por conta própria: entrega o que o bus mandou', async () => {
      const { resolver, source } = fixture();
      const outroPost = PostId.generate();
      const stream = resolver.onPostUpdated(postId.value);
      const first = stream[Symbol.asyncIterator]().next();

      source.next(
        new PostUpdatedEvent(
          outroPost.value,
          't',
          'c',
          authorId.value,
          'manuel',
          [],
          2,
          now,
          now,
        ),
      );
      const { value } = await first;

      expect((value as PostUpdatedEvent).postId).toBe(outroPost.value);
    });

    it('quando o cliente vai embora, o iterador fecha e larga o stream', async () => {
      const { resolver, source } = fixture();
      const stream = resolver.onPostUpdated();
      const iterator = stream[Symbol.asyncIterator]();
      const pending = iterator.next();
      expect(source.observed).toBe(true);

      await iterator.return?.();

      expect(await pending).toEqual({ value: undefined, done: true });
      expect(source.observed).toBe(false);
    });
  });
});
