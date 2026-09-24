import {
  claimTriggers,
  inngestFunctionId,
  literalTriggers,
} from './inngest-triggers';

const registry: Record<string, string[]> = {
  'posts.#': ['posts.PostCreated', 'posts.PostPreCreated', 'posts.PostUpdated'],
};

const resolve = (pattern: string): string[] =>
  registry[pattern] ?? literalTriggers(pattern);

describe('the triggers of a binding', () => {
  describe('read off the pattern alone', () => {
    it('leaves a literal name alone', () => {
      expect(literalTriggers('posts.PostCreated')).toEqual([
        'posts.PostCreated',
      ]);
    });

    it('drops the aggregate segment a queue would match', () => {
      expect(literalTriggers('posts.PostCreated.*')).toEqual([
        'posts.PostCreated',
      ]);
    });

    it('answers nothing for a namespace, which only a registry can spell out', () => {
      expect(literalTriggers('posts.#')).toEqual([]);
      expect(literalTriggers('posts.*.p-1')).toEqual([]);
    });
  });

  describe('claimed across the bindings of one service', () => {
    it('gives an event to the more specific binding, so one event is one run', () => {
      const claimed = claimTriggers(
        ['posts.#', 'posts.PostPreCreated.*'],
        resolve,
      );

      expect(claimed.get('posts.PostPreCreated.*')).toEqual([
        'posts.PostPreCreated',
      ]);
      expect(claimed.get('posts.#')).toEqual([
        'posts.PostCreated',
        'posts.PostUpdated',
      ]);
    });

    it('prefers a literal binding over every wildcard, as a broker does', () => {
      const claimed = claimTriggers(['posts.#', 'posts.PostCreated'], resolve);

      expect(claimed.get('posts.PostCreated')).toEqual(['posts.PostCreated']);
      expect(claimed.get('posts.#')).not.toContain('posts.PostCreated');
    });

    it('leaves a binding with nothing left to claim empty, which is what the warning reads', () => {
      const claimed = claimTriggers(
        ['posts.PostCreated.*', 'posts.PostCreated'],
        resolve,
      );

      expect(claimed.get('posts.PostCreated')).toEqual(['posts.PostCreated']);
      expect(claimed.get('posts.PostCreated.*')).toEqual([]);
    });
  });

  it('derives a function id a URL can carry', () => {
    expect(inngestFunctionId('posts.#')).toBe('posts');
    expect(inngestFunctionId('posts.PostCreated.*')).toBe('posts-postcreated');
  });
});
