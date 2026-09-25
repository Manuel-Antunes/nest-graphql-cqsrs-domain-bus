import { env } from '@/env.mjs';
import { GraphqlServerProxy } from '@/lib/graphql-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const proxy = new GraphqlServerProxy(env.NEXT_PUBLIC_GATEWAY_URL);

export async function POST(request: Request) {
  return proxy.proxy(request);
}
