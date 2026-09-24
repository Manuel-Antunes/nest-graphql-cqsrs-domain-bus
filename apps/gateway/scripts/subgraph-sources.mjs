import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../../../', import.meta.url));

export const subgraphSources = [
  { name: 'posts', sdlDir: `${repository}apps/posts-api/src/graphql` },
  {
    name: 'notifications',
    sdlDir: `${repository}apps/notificator/src/graphql`,
  },
];
