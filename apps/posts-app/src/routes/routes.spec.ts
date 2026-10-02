import { describe, expect, it } from 'vitest';

import { Openings } from './routes';

describe('Openings', () => {
  it('opens on the list for ChoosePostToEdit', () => {
    expect(
      Openings.for({ toolName: 'ChoosePostToEdit', toolInput: { first: 20 } }),
    ).toBe('/posts');
  });

  it('opens the editor of the post EditPost and SavePost name', () => {
    expect(
      Openings.for({ toolName: 'EditPost', toolInput: { id: 'a b/c' } }),
    ).toBe('/posts/a%20b%2Fc');
    expect(
      Openings.for({ toolName: 'SavePost', toolInput: { id: 'p1' } }),
    ).toBe('/posts/p1');
  });

  it('carries the draft of PreviewPost in the location, not in the path', () => {
    expect(
      Openings.for({
        toolName: 'PreviewPost',
        toolInput: { title: 'Hello', content: 'World', postId: ' ' },
      }),
    ).toEqual({
      pathname: '/preview',
      state: { title: 'Hello', content: 'World' },
    });
    expect(
      Openings.for({
        toolName: 'PreviewPost',
        toolInput: { title: 'Hello', content: 'World', postId: 'p1' },
      }),
    ).toEqual({
      pathname: '/preview',
      state: { title: 'Hello', content: 'World', postId: 'p1' },
    });
  });

  it('falls through to nothing for a host that named no tool or an unknown one', () => {
    expect(Openings.for(undefined)).toBe('/');
    expect(
      Openings.for({
        toolName: 'Unknown',
        toolInput: {},
      } as unknown as Parameters<typeof Openings.for>[0]),
    ).toBe('/');
  });
});
