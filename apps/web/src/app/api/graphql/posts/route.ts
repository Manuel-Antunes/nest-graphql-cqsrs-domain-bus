import { Endpoints } from '@/lib/endpoints';
import { GraphqlServerProxy } from '@/lib/graphql-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const proxy = new GraphqlServerProxy(Endpoints.postsSubgraph());

export async function POST(request: Request) {
  return proxy.proxy(request);
}
