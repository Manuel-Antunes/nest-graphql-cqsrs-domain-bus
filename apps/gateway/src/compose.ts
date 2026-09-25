import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LocalComposeSupergraph } from '@nestposts/federation-gateway';

import { appConfig } from './config/app.config';

const outDir = process.argv[2] ?? join(__dirname, 'supergraph');
const supergraph = new LocalComposeSupergraph(appConfig().subgraphs);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'supergraph.graphql'), supergraph.compose());
writeFileSync(join(outDir, 'api.graphql'), supergraph.apiSchema());
