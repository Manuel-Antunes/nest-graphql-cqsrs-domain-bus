import { addTypenameToDocument } from '@apollo/client/utilities';
import { parse, print } from 'graphql';

import type { AnyDocument } from './types';

/**
 * Collapses a GraphQL document into a single line so it can serve as a stable
 * React Query cache key. Two documents that differ only in indentation must
 * produce the same key.
 */
export const normalizeQueryKey = (query: string): string =>
  String(query).replace(/\s+/g, ' ').trim();

const requestStringCache = new WeakMap<AnyDocument, string>();

/**
 * The string actually sent over the wire: the document with `__typename` added
 * to every selection set.
 *
 * Apollo's normalized cache keys entities on `__typename` + `id`. Without this,
 * a response has no `__typename`, nothing normalizes, and two queries that
 * fetch the same entity keep two unrelated copies of it. Parsing and printing
 * is not cheap, so results are memoized per document object — the codegen
 * documents are module-level singletons, so the map stays small.
 */
export function toRequestString(document: AnyDocument): string {
  const hit = requestStringCache.get(document);
  if (hit) return hit;

  const transformed = print(addTypenameToDocument(parse(document.toString())));
  requestStringCache.set(document, transformed);
  return transformed;
}
