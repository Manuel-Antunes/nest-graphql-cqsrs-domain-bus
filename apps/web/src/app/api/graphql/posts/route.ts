import { POSTS_SUBGRAPH } from '@/lib/env';
import { GraphqlServerProxy } from '@/lib/graphql-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const proxy = new GraphqlServerProxy(POSTS_SUBGRAPH);

export async function POST(request: Request) {
  return proxy.proxy(request);
}
