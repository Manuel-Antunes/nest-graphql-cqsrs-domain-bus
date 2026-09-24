import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SupergraphCompositionException } from './compose-supergraph';
import { LocalComposeSupergraph } from './local-compose-supergraph';
import { readSubgraphSdl } from './subgraph-source';

const LINK =
  'extend schema @link(url: "https://specs.apollo.dev/federation/v2.3", import: ["@key", "@shareable"])';

describe('LocalComposeSupergraph', () => {
  let root: string;

  const subgraph = (name: string, files: Record<string, string>): string => {
    const dir = join(root, name);
    mkdirSync(dir, { recursive: true });
    for (const [file, sdl] of Object.entries(files)) {
      writeFileSync(join(dir, file), sdl);
    }
    return dir;
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'supergraph-'));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('reads a schema-first subgraph as all of its .graphql files, merged as Nest merges them', () => {
    const dir = subgraph('posts', {
      'a.graphql': LINK,
      'b.graphql': 'type Mutation { b: Int }',
      'c.graphql': 'type Mutation { c: Int }\ntype Query { q: Int }',
      'notes.txt': 'type Nope { never: Int }',
    });

    const sdl = readSubgraphSdl(dir);

    expect(sdl.match(/type Mutation/g)).toHaveLength(1);
    expect(sdl).toContain('b: Int');
    expect(sdl).toContain('c: Int');
    expect(sdl).toContain('@link');
    expect(sdl).not.toContain('Nope');
  });

  it('composes the subgraphs into a supergraph routed at their URLs, and derives the API schema from it', () => {
    const supergraph = new LocalComposeSupergraph([
      {
        name: 'posts',
        url: 'http://posts:3000/graphql',
        sdlDir: subgraph('posts', {
          'schema.graphql': `${LINK}\ntype Post @key(fields: "id") { id: ID! title: String! }\ntype Query { post(id: ID!): Post }`,
        }),
      },
      {
        name: 'notifications',
        url: 'http://notificator:3002/graphql',
        sdlDir: subgraph('notifications', {
          'schema.graphql': `${LINK}\ntype Query { unreadNotificationCount: Int! }`,
        }),
      },
    ]);

    const sdl = supergraph.compose();

    expect(supergraph.subgraphNames).toEqual(['posts', 'notifications']);
    expect(sdl).toContain(
      '@join__graph(name: "posts", url: "http://posts:3000/graphql")',
    );
    expect(sdl).toContain(
      '@join__graph(name: "notifications", url: "http://notificator:3002/graphql")',
    );
    expect(supergraph.apiSchema()).toContain('unreadNotificationCount: Int!');
    expect(supergraph.apiSchema()).not.toContain('join__');
  });

  it('refuses subgraphs that do not compose, naming the reason', () => {
    const supergraph = new LocalComposeSupergraph([
      {
        name: 'a',
        url: 'http://a/graphql',
        sdlDir: subgraph('a', {
          's.graphql': `${LINK}\ntype Query { thing: Int }`,
        }),
      },
      {
        name: 'b',
        url: 'http://b/graphql',
        sdlDir: subgraph('b', {
          's.graphql': `${LINK}\ntype Query { thing: String }`,
        }),
      },
    ]);

    expect(() => supergraph.compose()).toThrow(SupergraphCompositionException);
    expect(() => supergraph.compose()).toThrow(/thing/);
  });
});
