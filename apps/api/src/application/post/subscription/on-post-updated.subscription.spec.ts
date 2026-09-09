import { PostUpdatedEvent } from '../../../domain/post/event/post-updated.event';
import { OnPostUpdatedSubscription } from './on-post-updated.subscription';

/**
 * O filtro por tópico é regra de aplicação — então é testado como regra de aplicação, sem subir bus
 * nenhum: a mensagem responde sozinha se um evento interessa a quem a pediu.
 */
describe('OnPostUpdatedSubscription', () => {
  const event = (postId: string) =>
    new PostUpdatedEvent(postId, 'título', 'conteúdo', 'manuel', [], 2, new Date(), new Date());

  it('without a postId, every updated post is of interest', () => {
    const subscription = new OnPostUpdatedSubscription({});

    expect(subscription.filter(event('p1'))).toBe(true);
    expect(subscription.filter(event('p2'))).toBe(true);
    expect(new OnPostUpdatedSubscription({ postId: null }).filter(event('p1'))).toBe(true);
  });

  it('with a postId, only that post is', () => {
    const subscription = new OnPostUpdatedSubscription({ postId: 'p1' });

    expect(subscription.filter(event('p1'))).toBe(true);
    expect(subscription.filter(event('p2'))).toBe(false);
  });

  it('is the same request — the same key — when the criteria match, and not when they differ', () => {
    expect(new OnPostUpdatedSubscription({ postId: 'p1' }).key).toBe(new OnPostUpdatedSubscription({ postId: 'p1' }).key);
    expect(new OnPostUpdatedSubscription({ postId: 'p1' }).key).not.toBe(new OnPostUpdatedSubscription({ postId: 'p2' }).key);
    expect(new OnPostUpdatedSubscription({}).key).not.toBe(new OnPostUpdatedSubscription({ postId: 'p1' }).key);
  });
});
