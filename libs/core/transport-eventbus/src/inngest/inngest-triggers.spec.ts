import {
  inngestFunctionId,
  MAX_TRIGGERS,
} from '@nestposts/microservices-inngest/inngest-triggers';
import { EventType } from '@nestposts/platform/domain/shared/event-type';

import { inngestTriggers } from './inngest-triggers';

const SPEC_NAMESPACE = 'inngestwire';

@EventType({ namespace: SPEC_NAMESPACE, name: 'Born', tags: ['postId'] })
class BornEvent {
  constructor(readonly postId: string) {}
}

@EventType({ namespace: SPEC_NAMESPACE, name: 'Completed', tags: ['postId'] })
class CompletedEvent {
  constructor(readonly postId: string) {}
}

describe('a binding, as the names Inngest can trigger on', () => {
  it('expands a namespace into one trigger per event of it the process has REGISTERED', () => {
    void BornEvent;
    void CompletedEvent;

    const triggers = inngestTriggers(`${SPEC_NAMESPACE}.#`);

    expect(triggers).toEqual([
      `${SPEC_NAMESPACE}.Born`,
      `${SPEC_NAMESPACE}.Completed`,
    ]);
    expect(triggers.length).toBeLessThanOrEqual(MAX_TRIGGERS);
  });

  it('drops the aggregate segment of a single type, which is the wildcard a queue would match', () => {
    expect(inngestTriggers('posts.PostCreated.*')).toEqual([
      'posts.PostCreated',
    ]);
  });

  it('leaves a literal name alone', () => {
    expect(inngestTriggers('posts.PostCreated')).toEqual(['posts.PostCreated']);
  });

  it('answers nothing for a namespace nobody registered, which is what makes the warning possible', () => {
    expect(inngestTriggers('nowhere.#')).toEqual([]);
  });

  it('derives a function id a URL can carry', () => {
    expect(inngestFunctionId('posts.#')).toBe('posts');
    expect(inngestFunctionId('posts.PostCreated.*')).toBe('posts-postcreated');
  });
});
