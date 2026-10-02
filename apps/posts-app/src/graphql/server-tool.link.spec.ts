import { ApolloClient, ApolloLink, gql, InMemoryCache } from '@apollo/client';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { ServerToolError, ServerToolLink } from './server-tool.link';

const MANIFEST = {
  operations: [
    {
      id: '1',
      name: 'SavePost',
      type: 'mutation' as const,
      body: '',
      prefetch: false,
      tools: [{ name: 'SavePost', description: '' }],
    },
    {
      id: '2',
      name: 'EditPost',
      type: 'query' as const,
      body: '',
      prefetch: false,
      tools: [{ name: 'EditPost', description: '' }],
    },
  ],
};

const SAVE = gql`
  mutation SavePost($id: ID!, $title: String) {
    updatePost(input: { id: $id, title: $title }) {
      id
      title
    }
  }
`;

const EDIT = gql`
  query EditPost($id: ID!) {
    post(id: $id) {
      id
      title
    }
  }
`;

function clientWith(
  callServerTool: ReturnType<typeof vi.fn>,
  next = vi.fn((_operation: unknown) =>
    of({
      data: {
        post: { __typename: 'Post', id: 'p1', title: 'Through execute' },
      },
    }),
  ),
) {
  const client = new ApolloClient({
    cache: new InMemoryCache(),
    link: ApolloLink.from([
      new ServerToolLink(MANIFEST),
      new ApolloLink((operation) => next(operation)),
    ]),
  });
  Object.assign(client, { appManager: { app: { callServerTool } } });
  return { client, next };
}

const saved = {
  data: { updatePost: { __typename: 'Post', id: 'p1', title: 'New title' } },
};

describe('ServerToolLink', () => {
  it('runs a mutation of the manifest as its tool, with the variables as arguments', async () => {
    const callServerTool = vi.fn(async () => ({
      content: [],
      structuredContent: { result: saved, toolName: 'SavePost' },
    }));
    const { client, next } = clientWith(callServerTool);

    const { data } = await client.mutate({
      mutation: SAVE,
      variables: { id: 'p1', title: 'New title' },
    });

    expect(callServerTool).toHaveBeenCalledWith({
      name: 'SavePost',
      arguments: { id: 'p1', title: 'New title' },
    });
    expect(next).not.toHaveBeenCalled();
    expect(data).toEqual(saved.data);
  });

  it('prefers the full result the host keeps out of what the model reads', async () => {
    const full = {
      data: { updatePost: { __typename: 'Post', id: 'p1', title: 'Full' } },
    };
    const { client } = clientWith(
      vi.fn(async () => ({
        content: [],
        structuredContent: { result: saved },
        _meta: { structuredContent: { result: full } },
      })),
    );

    const { data } = await client.mutate({
      mutation: SAVE,
      variables: { id: 'p1' },
    });

    expect(data).toEqual(full.data);
  });

  it('hands a GraphQL refusal to Apollo Client as the errors it is', async () => {
    const { client } = clientWith(
      vi.fn(async () => ({
        isError: true,
        content: [{ type: 'text', text: 'not the author' }],
        structuredContent: {
          result: { data: null, errors: [{ message: 'not the author' }] },
        },
      })),
    );

    await expect(
      client.mutate({ mutation: SAVE, variables: { id: 'p1' } }),
    ).rejects.toThrow('not the author');
  });

  it('fails with what the host said when no result came back', async () => {
    await expect(
      ServerToolLink.call(
        {
          callServerTool: async () => ({
            isError: true,
            content: [{ type: 'text', text: 'MCP request failed' }],
          }),
        },
        'SavePost',
        {},
      ),
    ).rejects.toEqual(new ServerToolError('MCP request failed'));
    await expect(
      ServerToolLink.call(
        { callServerTool: async () => ({ error: 'Unknown server: posts' }) },
        'SavePost',
        {},
      ),
    ).rejects.toThrow('Unknown server: posts');
  });

  it('leaves a query to the next link, which runs it through execute', async () => {
    const callServerTool = vi.fn();
    const { client, next } = clientWith(callServerTool);

    const { data } = await client.query({
      query: EDIT,
      variables: { id: 'p1' },
    });

    expect(callServerTool).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
    expect(data).toEqual({
      post: { __typename: 'Post', id: 'p1', title: 'Through execute' },
    });
  });
});
