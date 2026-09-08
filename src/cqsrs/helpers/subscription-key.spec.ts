import { subscriptionKey } from './subscription-key';

describe('subscriptionKey', () => {
  it('is the same for the same criteria written in any order', () => {
    expect(subscriptionKey({ postId: 'p1', author: 'manuel' })).toBe(subscriptionKey({ author: 'manuel', postId: 'p1' }));
  });

  it('sorts nested objects too', () => {
    expect(subscriptionKey({ range: { from: 1, to: 2 } })).toBe(subscriptionKey({ range: { to: 2, from: 1 } }));
  });

  it('reads an undefined criterion as an absent one — both mean "no filter"', () => {
    expect(subscriptionKey({ postId: undefined })).toBe(subscriptionKey({}));
  });

  it('separates criteria that differ, including null from undefined', () => {
    expect(subscriptionKey({ postId: 'p1' })).not.toBe(subscriptionKey({ postId: 'p2' }));
    expect(subscriptionKey({ postId: null })).not.toBe(subscriptionKey({}));
  });

  it('keeps the order of arrays, which is information', () => {
    expect(subscriptionKey({ tags: ['a', 'b'] })).not.toBe(subscriptionKey({ tags: ['b', 'a'] }));
  });

  it('turns no criteria at all into a key of its own', () => {
    expect(subscriptionKey(undefined)).toBe('void');
    expect(subscriptionKey(undefined)).toBe(subscriptionKey(undefined));
  });
});
