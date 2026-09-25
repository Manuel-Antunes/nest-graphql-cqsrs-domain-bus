import { describe, expect, it } from 'vitest';

import { GraphQLResponseError } from './graphql-response-error';

describe('GraphQLResponseError', () => {
  it('joins the error messages into the message', () => {
    const error = new GraphQLResponseError([
      { message: 'first' },
      { message: 'second' },
    ]);
    expect(error.message).toBe('first\nsecond');
  });

  it('falls back to a generic message for an empty error list', () => {
    expect(new GraphQLResponseError([]).message).toBe('GraphQL request failed');
  });

  it('is detected across realms through the symbol brand', () => {
    const error = new GraphQLResponseError([{ message: 'boom' }]);
    expect(GraphQLResponseError.is(error)).toBe(true);
    expect(GraphQLResponseError.is(new Error('boom'))).toBe(false);
    expect(GraphQLResponseError.is(null)).toBe(false);
  });

  it('reports a partial response only when data came back', () => {
    expect(new GraphQLResponseError([{ message: 'boom' }]).isPartial).toBe(
      false,
    );
    expect(
      new GraphQLResponseError([{ message: 'boom' }], { user: null }).isPartial,
    ).toBe(true);
  });

  it('finds errors by code and by path', () => {
    const error = new GraphQLResponseError([
      { message: 'boom', path: ['user', 'email'], extensions: { code: 'X' } },
      { message: 'nope', path: ['user'], extensions: { code: 'Y' } },
    ]);
    expect(error.hasCode('X')).toBe(true);
    expect(error.hasCode('Z')).toBe(false);
    expect(error.byPath('user.email')).toHaveLength(1);
    expect(error.codes).toEqual(['X', 'Y']);
  });

  describe('from', () => {
    it('rebuilds the error from a GraphQL envelope', () => {
      const error = GraphQLResponseError.from({
        data: { user: null },
        errors: [{ message: 'boom', extensions: { code: 'FORBIDDEN' } }],
        extensions: { traceId: 'abc' },
      });

      expect(error?.code).toBe('FORBIDDEN');
      expect(error?.status).toBe(403);
      expect(error?.isPartial).toBe(true);
      expect(error?.extensions).toEqual({ traceId: 'abc' });
    });

    it('ignores bodies that are not GraphQL envelopes', () => {
      expect(GraphQLResponseError.from(undefined)).toBeUndefined();
      expect(GraphQLResponseError.from('oops')).toBeUndefined();
      expect(GraphQLResponseError.from({ errors: [] })).toBeUndefined();
      expect(GraphQLResponseError.from({ code: 'FORBIDDEN' })).toBeUndefined();
    });
  });

  describe('fromTransportError', () => {
    it('unwraps the GraphQL envelope out of an AxiosError and keeps the cause', () => {
      const axiosError = {
        isAxiosError: true,
        response: {
          status: 500,
          data: {
            errors: [{ message: 'boom', extensions: { status: 404 } }],
          },
        },
      };

      const error = GraphQLResponseError.fromTransportError(axiosError);
      expect(error?.status).toBe(404);
      expect(error?.cause).toBe(axiosError);
    });

    it('returns undefined when the response body is not a GraphQL envelope', () => {
      expect(
        GraphQLResponseError.fromTransportError({
          response: { status: 500, data: '<html>oops</html>' },
        }),
      ).toBeUndefined();
      expect(
        GraphQLResponseError.fromTransportError(new Error('offline')),
      ).toBeUndefined();
    });
  });
});
