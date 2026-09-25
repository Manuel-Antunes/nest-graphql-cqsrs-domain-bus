import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
import { describe, expect, it } from 'vitest';

import { normalizeQueryKey, toRequestString } from './request-string';

function doc(source: string): DocumentTypeDecoration<unknown, unknown> {
  return { toString: () => source } as DocumentTypeDecoration<unknown, unknown>;
}

describe('normalizeQueryKey', () => {
  it('collapses whitespace so indentation cannot fork the cache key', () => {
    expect(
      normalizeQueryKey(`
        query Me {
          me { id }
        }
      `),
    ).toBe('query Me { me { id } }');
  });
});

describe('toRequestString', () => {
  it('adds __typename to every selection set', () => {
    const printed = toRequestString(doc('query Me { me { id } }'));

    expect(printed).toContain('__typename');
    expect(printed.match(/__typename/g)).toHaveLength(1);
  });

  it('adds __typename inside nested selections and fragments', () => {
    const printed = toRequestString(
      doc(`
        query Chats { me { id ...Chats_UserFragment } }
        fragment Chats_UserFragment on User { chats { nodes { id } } }
      `),
    );

    // me, chats, nodes, and the fragment's User selection set.
    expect(printed.match(/__typename/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('does not add __typename to the root operation selection set', () => {
    const printed = toRequestString(doc('query Me { me { id } }'));

    expect(printed).not.toMatch(/query Me \{\s*__typename/);
  });

  it('memoizes per document object', () => {
    let calls = 0;
    const document = {
      toString: () => {
        calls++;
        return 'query Me { me { id } }';
      },
    } as DocumentTypeDecoration<unknown, unknown>;

    const first = toRequestString(document);
    const second = toRequestString(document);

    expect(second).toBe(first);
    expect(calls).toBe(1);
  });
});
