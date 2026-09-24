import { ROOT_TENANT, Tenant } from '@nestposts/database';
import { PostUpdatedEvent } from '@nestposts/posts/domain/post/event/post-updated.event';

import { OnPostUpdatedSubscription } from './on-post-updated.subscription';

describe('OnPostUpdatedSubscription.OnPostUpdated', () => {
  const event = (postId: string) =>
    new PostUpdatedEvent(
      postId,
      'título',
      'conteúdo',
      'u1',
      'manuel',
      [],
      2,
      new Date(),
      new Date(),
    );

  it('without a postId, every updated post is of interest', () => {
    const subscription = new OnPostUpdatedSubscription.OnPostUpdated({
      tenantId: ROOT_TENANT,
    });

    expect(subscription.match(event('p1'))).toBe(true);
    expect(subscription.match(event('p2'))).toBe(true);
    expect(
      new OnPostUpdatedSubscription.OnPostUpdated({
        tenantId: ROOT_TENANT,
        postId: null,
      }).match(event('p1')),
    ).toBe(true);
  });

  it('with a postId, only that post is', () => {
    const subscription = new OnPostUpdatedSubscription.OnPostUpdated({
      tenantId: ROOT_TENANT,
      postId: 'p1',
    });

    expect(subscription.match(event('p1'))).toBe(true);
    expect(subscription.match(event('p2'))).toBe(false);
  });

  it('is the same request — the same key — when the criteria match, and not when they differ', () => {
    expect(
      new OnPostUpdatedSubscription.OnPostUpdated({
        tenantId: ROOT_TENANT,
        postId: 'p1',
      }).key,
    ).toBe(
      new OnPostUpdatedSubscription.OnPostUpdated({
        tenantId: ROOT_TENANT,
        postId: 'p1',
      }).key,
    );
    expect(
      new OnPostUpdatedSubscription.OnPostUpdated({
        tenantId: ROOT_TENANT,
        postId: 'p1',
      }).key,
    ).not.toBe(
      new OnPostUpdatedSubscription.OnPostUpdated({
        tenantId: ROOT_TENANT,
        postId: 'p2',
      }).key,
    );
    expect(
      new OnPostUpdatedSubscription.OnPostUpdated({ tenantId: ROOT_TENANT })
        .key,
    ).not.toBe(
      new OnPostUpdatedSubscription.OnPostUpdated({
        tenantId: ROOT_TENANT,
        postId: 'p1',
      }).key,
    );
  });

  it('only in its own tenant, and a subscription per tenant is a stream per tenant', () => {
    const acme = new OnPostUpdatedSubscription.OnPostUpdated({
      tenantId: 'acme',
    });

    expect(acme.match(Tenant.stamp(event('p1'), 'acme'))).toBe(true);
    expect(acme.match(event('p1'))).toBe(false);
    expect(acme.key).not.toBe(
      new OnPostUpdatedSubscription.OnPostUpdated({ tenantId: ROOT_TENANT })
        .key,
    );
  });
});
