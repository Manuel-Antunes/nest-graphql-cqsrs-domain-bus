import { createSchema, createYoga } from 'graphql-yoga';

import { composeSupergraphSdl } from '../composition/compose-supergraph';
import type { Listening } from '../testing/listening';
import { listening } from '../testing/listening';
import { StitchedGateway } from './stitched-gateway';

const POSTS_SDL = /* GraphQL */ `
  extend schema
    @link(
      url: "https://specs.apollo.dev/federation/v2.3"
      import: ["@key", "@interfaceObject", "@external"]
    )

  interface IUser @key(fields: "id") {
    id: ID!
    name: String!
  }

  type User implements IUser @key(fields: "id") {
    id: ID!
    name: String!
  }

  type Author implements IUser @key(fields: "id") {
    id: ID!
    name: String!
  }

  type Query {
    author(id: ID!): Author
    someone(id: ID!): IUser
  }
`;

const NOTIFICATIONS_SDL = /* GraphQL */ `
  extend schema
    @link(
      url: "https://specs.apollo.dev/federation/v2.3"
      import: ["@key", "@interfaceObject", "@external"]
    )

  type IUser @key(fields: "id") @interfaceObject {
    id: ID!
    notifications: [Notification!]!
  }

  type Notification {
    id: ID!
    title: String
    recipient: IUser
  }

  type Query {
    notification(id: ID!): Notification
  }
`;

const AUTHORS: Record<string, { id: string; name: string }> = {
  'u-1': { id: 'u-1', name: 'Ana' },
};

const NOTIFICATIONS: Record<string, Array<{ id: string; title: string }>> = {
  'u-1': [{ id: 'n-9', title: 'Your post is live' }],
};

describe('@interfaceObject', () => {
  let representations: Array<Record<string, unknown>> = [];
  let posts: Listening;
  let notifications: Listening;
  let gateway: Listening;
  const servers: Listening[] = [];

  const postsYoga = createYoga({
    schema: createSchema({
      typeDefs: /* GraphQL */ `
        interface IUser {
          id: ID!
          name: String!
        }
        type User implements IUser {
          id: ID!
          name: String!
        }
        type Author implements IUser {
          id: ID!
          name: String!
        }
        scalar _Any
        union _Entity = User | Author
        type Query {
          author(id: ID!): Author
          someone(id: ID!): IUser
          _entities(representations: [_Any!]!): [_Entity]!
        }
      `,
      resolvers: {
        Query: {
          author: (_: unknown, { id }: { id: string }) => AUTHORS[id] ?? null,
          someone: (_: unknown, { id }: { id: string }) => AUTHORS[id] ?? null,
          _entities: (
            _: unknown,
            {
              representations: wanted,
            }: { representations: Array<{ id: string }> },
          ) =>
            wanted.map((representation) => AUTHORS[representation.id] ?? null),
        },
        IUser: { __resolveType: () => 'Author' },
        Author: { __isTypeOf: () => true },
        _Entity: { __resolveType: () => 'Author' },
      },
    }),
    logging: false,
  });

  const notificationsYoga = createYoga({
    schema: createSchema({
      typeDefs: /* GraphQL */ `
        type Notification {
          id: ID!
          title: String
          recipient: IUser
        }
        type IUser {
          id: ID!
          notifications: [Notification!]!
        }
        scalar _Any
        union _Entity = IUser
        type Query {
          notification(id: ID!): Notification
          _entities(representations: [_Any!]!): [_Entity]!
        }
      `,
      resolvers: {
        Query: {
          notification: (_: unknown, { id }: { id: string }) => ({
            id,
            title: 'Your post is live',
            recipient: { __typename: 'IUser', id: 'u-1' },
          }),
          _entities: (
            _: unknown,
            {
              representations: wanted,
            }: { representations: Array<Record<string, unknown>> },
          ) => {
            representations = wanted;
            return wanted.map((representation) => ({
              id: representation.id,
              notifications: NOTIFICATIONS[String(representation.id)] ?? [],
            }));
          },
        },
        _Entity: { __resolveType: () => 'IUser' },
      },
    }),
    logging: false,
  });

  const gatewayOver = async (notificationsSdl: string): Promise<Listening> => {
    const served = await listening(
      createYoga({
        schema: new StitchedGateway().build(
          composeSupergraphSdl([
            { name: 'posts', url: posts.url, sdl: POSTS_SDL },
            {
              name: 'notifications',
              url: notifications.url,
              sdl: notificationsSdl,
            },
          ]),
        ),
        logging: false,
      }),
    );
    servers.push(served);
    return served;
  };

  beforeAll(async () => {
    posts = await listening(postsYoga);
    notifications = await listening(notificationsYoga);
    servers.push(posts, notifications);
    gateway = await gatewayOver(NOTIFICATIONS_SDL);
  });

  afterAll(async () => {
    await Promise.all(servers.map((server) => server.close()));
  });

  const query = async (document: string, through: Listening = gateway) => {
    representations = [];
    const response = await fetch(through.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: document }),
    });
    return response.json() as Promise<{
      data?: Record<string, unknown>;
      errors?: Array<{ message: string }>;
    }>;
  };

  it('resolves a contributed field on a concrete implementation', async () => {
    const body = await query(
      '{ author(id: "u-1") { id name notifications { id title } } }',
    );

    expect(body.errors).toBeUndefined();
    expect(body.data?.author).toEqual({
      id: 'u-1',
      name: 'Ana',
      notifications: [{ id: 'n-9', title: 'Your post is live' }],
    });
  });

  it('asks the contributing subgraph by the INTERFACE name, the only one it knows', async () => {
    await query('{ author(id: "u-1") { notifications { id } } }');

    expect(representations).toEqual([{ __typename: 'IUser', id: 'u-1' }]);
  });

  it('resolves a bare interface reference back to its concrete type', async () => {
    const body = await query(
      '{ notification(id: "n-9") { recipient { __typename id name } } }',
    );

    expect(body.errors).toBeUndefined();
    expect(body.data?.notification).toEqual({
      recipient: { __typename: 'Author', id: 'u-1', name: 'Ana' },
    });
  });

  it('resolves the field when the query is on the interface itself', async () => {
    const body = await query(
      '{ someone(id: "u-1") { id notifications { id } } }',
    );

    expect(body.errors).toBeUndefined();
    expect(body.data?.someone).toEqual({
      id: 'u-1',
      notifications: [{ id: 'n-9' }],
    });
  });

  it('reports the concrete __typename, never the interface object’s', async () => {
    const body = await query(
      '{ author(id: "u-1") { __typename notifications { id } } }',
    );

    expect(body.errors).toBeUndefined();
    expect(body.data?.author).toEqual({
      __typename: 'Author',
      notifications: [{ id: 'n-9' }],
    });
  });

  it('carries @requires through to the fetch', async () => {
    const withRequires = await gatewayOver(
      NOTIFICATIONS_SDL.replace(
        '    notifications: [Notification!]!',
        '    name: String! @external\n    notifications: [Notification!]! @requires(fields: "name")',
      ).replace(
        '"@key", "@interfaceObject", "@external"',
        '"@key", "@interfaceObject", "@external", "@requires"',
      ),
    );

    const body = await query(
      '{ author(id: "u-1") { notifications { id } } }',
      withRequires,
    );

    expect(body.errors).toBeUndefined();
    expect(representations).toEqual([
      { __typename: 'IUser', id: 'u-1', name: 'Ana' },
    ]);
  });

  it('leaves the rest of the object working', async () => {
    const body = await query('{ author(id: "u-1") { id name } }');

    expect(body.data?.author).toEqual({ id: 'u-1', name: 'Ana' });
  });
});
