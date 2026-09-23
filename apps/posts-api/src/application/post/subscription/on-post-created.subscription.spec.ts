import type { TestingModule } from '@nestjs/testing';
import { EventBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { SubscriptionBus } from '@nestposts/cqsrs';
import { CqsrsModule } from '@nestposts/cqsrs/cqsrs.module';
import { PostCreatedEvent } from '@nestposts/posts/domain/post/event/post-created.event';
import { PostUpdatedEvent } from '@nestposts/posts/domain/post/event/post-updated.event';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

import { OnPostCreatedSubscription } from './on-post-created.subscription';

describe('OnPostCreatedSubscription', () => {
  let module: TestingModule;
  let bus: SubscriptionBus;
  let eventBus: EventBus;
  const active: Array<{ unsubscribe(): void }> = [];

  const postId = PostId.parse('0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10');
  const authorId = UserId.parse('9f1d1f36-7c2e-4a0a-9b7d-2f5c1a3e4b60');
  const now = new Date('2026-09-08T12:00:00.000Z');

  const created = (id = postId) =>
    new PostCreatedEvent(
      id.value,
      'completo',
      'oi',
      authorId.value,
      [],
      2,
      now,
    );

  const collect = () => {
    const received: PostCreatedEvent[] = [];
    const stream = bus.subscribe<PostCreatedEvent>(
      new OnPostCreatedSubscription.OnPostCreated(),
    );
    active.push(stream.subscribe((event) => received.push(event)));
    return received;
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [CqsrsModule.forRoot()],
      providers: [OnPostCreatedSubscription.Handler],
    }).compile();
    await module.init();
    bus = module.get(SubscriptionBus);
    eventBus = module.get(EventBus);
  });

  afterEach(async () => {
    active.splice(0).forEach((subscription) => subscription.unsubscribe());
    await module.close();
  });

  it('entrega todo PostCreated que passar pelo EventBus, em ordem', () => {
    const received = collect();
    const outro = PostId.generate();

    eventBus.publish(created());
    eventBus.publish(created(outro));

    expect(received.map((event) => event.postId)).toEqual([
      postId.value,
      outro.value,
    ]);
  });

  it('não deixa passar evento de outro tipo publicado no mesmo bus', () => {
    const received = collect();

    eventBus.publish(
      new PostUpdatedEvent(
        postId.value,
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
    eventBus.publish(created());

    expect(received).toHaveLength(1);
    expect(received[0]).toBeInstanceOf(PostCreatedEvent);
  });

  it('o evento chega como foi publicado, sem tradução no caminho', () => {
    const received = collect();
    const event = created();

    eventBus.publish(event);

    expect(received[0]).toBe(event);
  });

  it('duas assinaturas pedem a mesma coisa e recebem o mesmo stream', () => {
    const first = bus.subscribe(new OnPostCreatedSubscription.OnPostCreated());
    const second = bus.subscribe(new OnPostCreatedSubscription.OnPostCreated());

    expect(second).toBe(first);
  });

  it('quem assina depois não recebe o que já passou', () => {
    const cedo = collect();
    eventBus.publish(created());

    const tarde = collect();
    eventBus.publish(created(PostId.generate()));

    expect(cedo).toHaveLength(2);
    expect(tarde).toHaveLength(1);
  });
});
