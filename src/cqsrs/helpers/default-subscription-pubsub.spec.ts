import { Subject } from 'rxjs';
import { Subscription } from '../classes/subscription';
import { DefaultSubscriptionPubSub } from './default-subscription-pubsub';

/**
 * O publisher padrão do `SubscriptionBus` — o espelho do `DefaultQueryPubSub` do @nestjs/cqrs.
 *
 * Ele é curto de propósito: empurra cada subscription pedida para o `Subject` do bus, e é isso que
 * torna o bus observável (`subscriptions$`). O que se afirma aqui é que ele **anuncia todo pedido**,
 * inclusive os repetidos — se ele desduplicasse, a instrumentação passaria a contar streams em vez de
 * assinaturas, que é outra pergunta.
 */
describe('DefaultSubscriptionPubSub', () => {
  class OnCounter extends Subscription<unknown, { topic?: string }> {}

  it('empurra cada subscription para o Subject de quem o criou', () => {
    // Arrange
    const subject$ = new Subject<OnCounter>();
    const seen: unknown[] = [];
    subject$.subscribe((subscription) => seen.push(subscription));
    const publisher = new DefaultSubscriptionPubSub(subject$);
    const first = new OnCounter({ topic: 'a' });
    const second = new OnCounter({ topic: 'b' });

    // Act
    publisher.publish(first);
    publisher.publish(second);

    // Assert
    expect(seen).toEqual([first, second]);
  });

  it('anuncia também o pedido repetido — quem conta assinaturas precisa vê-las todas', () => {
    // Arrange
    const subject$ = new Subject<OnCounter>();
    const seen: unknown[] = [];
    subject$.subscribe((subscription) => seen.push(subscription));
    const publisher = new DefaultSubscriptionPubSub(subject$);

    // Act
    publisher.publish(new OnCounter({ topic: 'a' }));
    publisher.publish(new OnCounter({ topic: 'a' }));

    // Assert
    expect(seen).toHaveLength(2);
  });

  it('publicar sem ninguém ouvindo não é erro', () => {
    // Arrange
    const publisher = new DefaultSubscriptionPubSub(new Subject<OnCounter>());

    // Act / Assert
    expect(() => publisher.publish(new OnCounter({}))).not.toThrow();
  });
});
