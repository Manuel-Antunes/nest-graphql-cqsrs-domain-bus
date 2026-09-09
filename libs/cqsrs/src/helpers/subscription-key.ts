/**
 * O critério de filtro de uma subscription → uma chave estável.
 *
 * É a peça que faz "o filtro é a chave": duas subscriptions do mesmo tipo pedidas com o mesmo
 * critério produzem a mesma string, e é por essa string que o `SubscriptionBus` acha (ou cria) o
 * stream que já está no ar. Por isso a serialização precisa ser *estável*, e não só correta:
 *
 * - as chaves de cada objeto saem ordenadas, então `{ postId, author }` e `{ author, postId }` — a
 *   mesma coisa, montada em duas ordens diferentes — dão a mesma chave;
 * - `undefined` some (é o que o `JSON.stringify` faz com propriedade de valor `undefined`), então
 *   `{ postId: undefined }` e `{}` são o mesmo critério — que é o que "sem filtro" quer dizer;
 * - um critério `void` (subscription sem filtro nenhum) vira a string `'void'`, porque
 *   `JSON.stringify(undefined)` devolve `undefined`, não uma string.
 *
 * Arrays não são reordenados: a ordem deles é informação.
 */
export function subscriptionKey(criteria: unknown): string {
  const serialized = JSON.stringify(criteria, (_key, value) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value as object).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : value,
  );
  return serialized ?? 'void';
}
