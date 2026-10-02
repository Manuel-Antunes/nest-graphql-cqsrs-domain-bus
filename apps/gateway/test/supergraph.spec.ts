import { subgraphSources } from '../scripts/subgraph-sources.mjs';
import { InterfaceObjects } from '../src/supergraph/interface-objects';
import { Supergraph } from '../src/supergraph/supergraph';

describe('the supergraph this gateway federates', () => {
  const supergraph = new Supergraph(
    subgraphSources.map(({ name, sdlDir }) => ({
      name,
      sdlDir,
      url: `http://${name}.test/graphql`,
    })),
  );

  it('composes from the subgraphs’ own SDL files', () => {
    expect(() => supergraph.sdl()).not.toThrow();
    expect(supergraph.subgraphNames).toEqual([
      'posts',
      'notifications',
      'chatwoot',
      'chat',
    ]);
  });

  it('serves posts, users and their subscriptions from one subgraph, notifications and chats from others', () => {
    const api = supergraph.apiSchema();

    for (const field of [
      'posts(',
      'me: IUser!',
      'unreadNotificationCount: Int!',
      'notifications(unreadOnly: Boolean = false, first: Int = 50): [Notification!]!',
      'deleteNotification(id: ID!): ID!',
      'onPostCreated',
      'chats(agentId: String, first: Int = 30): [Chat!]!',
      'recordChat(input: RecordChatInput!): Chat!',
    ]) {
      expect(api).toContain(field);
    }
    expect(api).not.toContain('join__');
  });

  it('adds what a user was told, and the chats they had, to every user type, through @interfaceObject', () => {
    const sdl = supergraph.sdl();
    const names = Supergraph.subgraphNamesOf(sdl);
    const bySubgraph = new Map(
      InterfaceObjects.collect(sdl).map((mapping) => [
        names.get(mapping.graph),
        mapping,
      ]),
    );

    expect([...bySubgraph.keys()].sort()).toEqual(['chat', 'notifications']);
    expect(bySubgraph.get('notifications')).toMatchObject({
      interfaceName: 'IUser',
      key: 'id',
      fields: ['notifications', 'unreadNotificationCount'],
    });
    expect(bySubgraph.get('chat')).toMatchObject({
      interfaceName: 'IUser',
      key: 'id',
      fields: ['chats'],
    });
    for (const mapping of bySubgraph.values()) {
      expect([...mapping.implementations].sort()).toEqual(['Author', 'User']);
    }
  });
});
