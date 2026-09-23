import { Subject } from 'rxjs';

import { Subscription } from '../classes/subscription';
import { DefaultSubscriptionPubSub } from './default-subscription-pubsub';

describe('DefaultSubscriptionPubSub', () => {
  class OnCounter extends Subscription<unknown, { topic?: string }> {}

  it('empurra cada subscription para o Subject de quem o criou', () => {
    const subject$ = new Subject<OnCounter>();
    const seen: unknown[] = [];
    subject$.subscribe((subscription) => seen.push(subscription));
    const publisher = new DefaultSubscriptionPubSub(subject$);
    const first = new OnCounter({ topic: 'a' });
    const second = new OnCounter({ topic: 'b' });

    publisher.publish(first);
    publisher.publish(second);

    expect(seen).toEqual([first, second]);
  });

  it('anuncia também o pedido repetido — quem conta assinaturas precisa vê-las todas', () => {
    const subject$ = new Subject<OnCounter>();
    const seen: unknown[] = [];
    subject$.subscribe((subscription) => seen.push(subscription));
    const publisher = new DefaultSubscriptionPubSub(subject$);

    publisher.publish(new OnCounter({ topic: 'a' }));
    publisher.publish(new OnCounter({ topic: 'a' }));

    expect(seen).toHaveLength(2);
  });

  it('publicar sem ninguém ouvindo não é erro', () => {
    const publisher = new DefaultSubscriptionPubSub(new Subject<OnCounter>());

    expect(() => publisher.publish(new OnCounter({}))).not.toThrow();
  });
});
