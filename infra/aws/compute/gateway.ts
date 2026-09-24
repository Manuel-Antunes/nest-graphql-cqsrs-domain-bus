/// <reference path="../../../.sst/platform/config.d.ts" />

import { vpc } from '../network';
import { StreamingFunction } from '../support';
import { notificationsSubgraph, streaming } from './api';
import { build } from './build';
import { gatewayEnvironment } from './environment';

const graphqlOf = (url: $util.Output<string>) =>
  url.apply((origin) => `${origin.replace(/\/$/, '')}/graphql`);

/**
 * **The one GraphQL endpoint the browser and every client call.** It composes the supergraph at boot
 * from the subgraph SDL copied beside its bundle (`nx build` bakes it into `dist/subgraphs`), and
 * routes each operation to the subgraphs' own function URLs — so a cold subgraph never stalls the
 * gateway's start, only the operations that reach it.
 */
export const gateway = new StreamingFunction('Gateway', {
  platform: {
    vpc,
    link: [],
    dependsOn: [build],
    environment: {
      ...gatewayEnvironment,
      POSTS_SUBGRAPH_URL: graphqlOf(streaming.url),
      NOTIFICATIONS_SUBGRAPH_URL: graphqlOf(notificationsSubgraph.url),
    },
  },
  handler: 'apps/gateway/dist/lambda/http.handler',
  memory: '1024 MB',
  copyFiles: [{ from: 'apps/gateway/dist/subgraphs', to: 'subgraphs' }],
});
