import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSchema, parse, validate } from 'graphql';

import { subgraphSources } from '../scripts/subgraph-sources.mjs';
import { Supergraph } from '../src/supergraph/supergraph';

const OPERATIONS = join(__dirname, '..', '..', 'mcp', 'operations');

const operations = readdirSync(OPERATIONS)
  .filter((file) => file.endsWith('.graphql'))
  .map((file) => ({
    file,
    document: readFileSync(join(OPERATIONS, file), 'utf8'),
  }));

describe('the posts MCP server’s operations', () => {
  const api = buildSchema(
    new Supergraph(
      subgraphSources.map(({ name, sdlDir }) => ({
        name,
        sdlDir,
        url: `http://${name}.test/graphql`,
      })),
    ).apiSchema(),
  );

  it('are the tools it was given', () => {
    expect(operations.map(({ file }) => file).sort()).toEqual([
      'create-post.graphql',
      'delete-post.graphql',
      'get-post.graphql',
      'list-posts.graphql',
      'update-post.graphql',
      'who-am-i.graphql',
    ]);
  });

  it.each(operations)(
    '$file is valid against the API schema the gateway composes',
    ({ document }) => {
      expect(
        validate(api, parse(document)).map(({ message }) => message),
      ).toEqual([]);
    },
  );

  it.each(operations)('$file holds one named operation', ({ document }) => {
    const definitions = parse(document).definitions;

    expect(definitions).toHaveLength(1);
    expect(definitions[0]).toMatchObject({
      kind: 'OperationDefinition',
      name: { kind: 'Name' },
    });
  });
});
