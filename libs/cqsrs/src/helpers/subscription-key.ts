/**
 * A subscription's filter criteria → a stable key.
 *
 * This is the piece that makes "the filter is the key": two subscriptions of the same type requested
 * with the same criteria produce the same string, and it is by that string that the `SubscriptionBus`
 * finds (or creates) the stream already on the air. That is why the serialization has to be *stable*,
 * not merely correct:
 *
 * - every object's keys come out sorted, so `{ postId, author }` and `{ author, postId }` — the same
 *   thing, assembled in two different orders — yield the same key;
 * - `undefined` disappears (what `JSON.stringify` does with a property whose value is `undefined`), so
 *   `{ postId: undefined }` and `{}` are the same criteria — which is what "no filter" means;
 * - `void` criteria (a subscription with no filter at all) become the string `'void'`, because
 *   `JSON.stringify(undefined)` returns `undefined`, not a string.
 *
 * Arrays are not reordered: their order is information.
 */
export function subscriptionKey(criteria: unknown): string {
  const serialized = JSON.stringify(criteria, (_key, value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value as object).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : value,
  );
  return serialized ?? 'void';
}
