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
    expect(supergraph.subgraphNames).toEqual(['posts', 'notifications']);
  });

  it('serves posts, users and their subscriptions from one subgraph, and notifications from the other', () => {
    const api = supergraph.apiSchema();

    for (const field of [
      'posts(',
      'me: IUser!',
      'unreadNotificationCount: Int!',
      'notifications(unreadOnly: Boolean = false, first: Int = 50): [Notification!]!',
      'deleteNotification(id: ID!): ID!',
      'onPostCreated',
    ]) {
      expect(api).toContain(field);
    }
    expect(api).not.toContain('join__');
  });

  it('adds what a user was told to every user type, through @interfaceObject', () => {
    const sdl = supergraph.sdl();
    const [mapping] = InterfaceObjects.collect(sdl);

    expect(Supergraph.subgraphNamesOf(sdl).get(mapping.graph)).toBe(
      'notifications',
    );
    expect(mapping).toMatchObject({
      interfaceName: 'IUser',
      key: 'id',
      fields: ['notifications', 'unreadNotificationCount'],
    });
    expect([...mapping.implementations].sort()).toEqual(['Author', 'User']);
  });
});
