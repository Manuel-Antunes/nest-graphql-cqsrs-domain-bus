import { EventBus } from '@nestjs/cqrs';
import { Test, type TestingModule } from '@nestjs/testing';
import { SubscriptionBus } from '../../../cqsrs';
import { CqsrsModule } from '../../../cqsrs/cqsrs.module';
import { PostCreatedEvent } from '../../../domain/post/event/post-created.event';
import { PostUpdatedEvent } from '../../../domain/post/event/post-updated.event';
import { PostId } from '../../../domain/post/vo/post-id';
import { UserId } from '../../../domain/user/vo/user-id';
import { OnPostCreatedSubscription } from './on-post-created.subscription';

/**
 * A subscription de criação: a mais simples das duas, e por isso a que diz melhor onde mora cada
 * decisão.
 *
 * Ela **não tem critério** — `TCriteria` é `void`, e o filtro herdado passa tudo. O que o handler faz
 * é uma coisa só: ligar a mensagem à fonte (`eventBus.pipe(ofType(PostCreatedEvent))`). Nenhum
 * emitter novo, nenhum PubSub — a subscription GraphQL ouve **o mesmo stream** em que as sagas e os
 * event handlers estão. É isso que o teste do `ofType` prende: um `PostUpdatedEvent` passando por
 * aqui seria um vazamento de tipo direto para o assinante.
 *
 * O resto — compartilhar o stream entre assinantes iguais, desligar quando o último sai — é do
 * `SubscriptionBus`, e está coberto lá.
 */
describe('OnPostCreatedSubscription', () => {
  let module: TestingModule;
  let bus: SubscriptionBus;
  let eventBus: EventBus;
  const active: Array<{ unsubscribe(): void }> = [];

  const postId = PostId.parse('0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10');
  const authorId = UserId.parse('9f1d1f36-7c2e-4a0a-9b7d-2f5c1a3e4b60');
  const now = new Date('2026-09-08T12:00:00.000Z');

  const created = (id = postId) => new PostCreatedEvent(id.value, 'nasceu', 'oi', authorId.value, 'manuel', now);

  /** Assina e grava o que chegar; a inscrição cai no fim do teste. */
  const collect = () => {
    const received: PostCreatedEvent[] = [];
    const stream = bus.subscribe<PostCreatedEvent>(new OnPostCreatedSubscription.OnPostCreated());
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
    // Arrange
    const received = collect();
    const outro = PostId.generate();

    // Act
    eventBus.publish(created());
    eventBus.publish(created(outro));

    // Assert — sem critério, "todos" quer dizer todos
    expect(received.map((event) => event.postId)).toEqual([postId.value, outro.value]);
  });

  /** `ofType` é o recorte: outro evento no mesmo bus não pode chegar a este assinante. */
  it('não deixa passar evento de outro tipo publicado no mesmo bus', () => {
    // Arrange
    const received = collect();

    // Act
    eventBus.publish(new PostUpdatedEvent(postId.value, 't', 'c', authorId.value, 'manuel', [], 2, now, now));
    eventBus.publish(created());

    // Assert
    expect(received).toHaveLength(1);
    expect(received[0]).toBeInstanceOf(PostCreatedEvent);
  });

  it('o evento chega como foi publicado, sem tradução no caminho', () => {
    // Arrange
    const received = collect();
    const event = created();

    // Act
    eventBus.publish(event);

    // Assert
    expect(received[0]).toBe(event);
  });

  /** Sem critério, `TCriteria` é `void` e todas as instâncias são o mesmo pedido. */
  it('duas assinaturas pedem a mesma coisa e recebem o mesmo stream', () => {
    // Act
    const first = bus.subscribe(new OnPostCreatedSubscription.OnPostCreated());
    const second = bus.subscribe(new OnPostCreatedSubscription.OnPostCreated());

    // Assert
    expect(second).toBe(first);
  });

  it('quem assina depois não recebe o que já passou', () => {
    // Arrange
    const cedo = collect();
    eventBus.publish(created());

    // Act
    const tarde = collect();
    eventBus.publish(created(PostId.generate()));

    // Assert
    expect(cedo).toHaveLength(2);
    expect(tarde).toHaveLength(1);
  });
});
