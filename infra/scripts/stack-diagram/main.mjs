#!/usr/bin/env node
// The deployed stack as a draw.io diagram in AWS's own icons: every component a group, every
// resource draw.io has an icon for a node inside it, and Pulumi's dependencies between them.
// README.md beside this file says how a resource finds its icon and how to change what it finds.
//
//   node infra/scripts/stack-diagram/main.mjs .sst/graph/dev.dot            # dev.drawio, dev.html
//   node infra/scripts/stack-diagram/main.mjs .sst/graph/dev.dot out/stack  # out/stack.drawio, .html
//   node infra/scripts/stack-diagram/main.mjs .sst/graph/dev.dot --types    # each type and its icon
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { DrawioCatalog } from './catalog.mjs';
import { SstConventions } from './conventions.mjs';
import { Diagram, Overrides } from './diagram.mjs';
import { DrawioDocument, ViewerPage } from './drawio.mjs';
import { Layout } from './layout.mjs';
import { PulumiStack } from './stack.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { types: { type: 'boolean', default: false } },
});
const [dot, output = dot?.replace(/\.dot$/, '')] = positionals;
if (!dot) {
  console.error(
    'usage: stack-diagram/main.mjs <stack.dot> [output prefix] [--types]',
  );
  process.exit(2);
}

const overrides = Overrides.read(new URL('./config.json', import.meta.url));
const catalog = await DrawioCatalog.load(overrides.aliases);
const stack = PulumiStack.read(dot);
const diagram = Diagram.of(stack, catalog, overrides, SstConventions.of(stack));

if (values.types) {
  for (const row of diagram.explain()) {
    const what = row.component ? 'group' : 'node ';
    const icon = row.icon
      ? `${row.icon.icon} (${row.icon.title})`
      : row.component
        ? 'hidden: nothing inside it is shown'
        : 'hidden: no icon';
    console.log(`${what} ${row.shown}/${row.count}  ${row.type}  →  ${icon}`);
  }
  process.exit(0);
}

const drawio = DrawioDocument.render(diagram, Layout.of(diagram));
writeFileSync(`${output}.drawio`, drawio);
writeFileSync(
  `${output}.html`,
  ViewerPage.render(`${stack.project} · ${stack.stack}`, drawio),
);
console.log(
  `==> ${output}.drawio, ${output}.html — ${diagram.groups.length} groups, ${diagram.nodes.length} resources and ${diagram.edges.length} dependencies of ${stack.resources.length} resources`,
);
