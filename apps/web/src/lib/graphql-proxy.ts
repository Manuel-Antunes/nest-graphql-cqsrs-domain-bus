import { WebAuth } from '@/lib/auth/server';

export class GraphqlServerProxy {
  private readonly requestHeaders = [
    'content-type',
    'accept',
    'traceparent',
    'tracestate',
    'baggage',
  ];
  private readonly responseHeaders = ['content-type', 'cache-control'];

  constructor(private readonly upstream: string) {}

  async proxy(request: Request): Promise<Response> {
    const body = await request.arrayBuffer();

    const upstream = await fetch(this.upstream, {
      method: 'POST',
      headers: await this.outbound(request),
      body,
      cache: 'no-store',
      signal: request.signal,
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: this.inbound(upstream),
    });
  }

  private async outbound(request: Request): Promise<Headers> {
    const headers = new Headers();
    for (const name of this.requestHeaders) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set('content-type', 'application/json');

    headers.set('origin', new URL(this.upstream).origin);
    const session = await WebAuth.sessionCookie();
    if (session) headers.set('cookie', session);
    for (const [name, value] of Object.entries(await WebAuth.tenantHeader())) {
      headers.set(name, value);
    }

    return headers;
  }

  private inbound(upstream: Response): Headers {
    const headers = new Headers();
    for (const name of this.responseHeaders) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set('cache-control', 'no-cache, no-store, no-transform');
    headers.set('x-accel-buffering', 'no');

    const cookies =
      (
        upstream.headers as Headers & { getSetCookie?: () => string[] }
      ).getSetCookie?.() ?? [];
    for (const cookie of cookies) headers.append('set-cookie', cookie);

    return headers;
  }
}
