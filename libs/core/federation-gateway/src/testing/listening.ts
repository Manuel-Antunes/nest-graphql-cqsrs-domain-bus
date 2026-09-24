import type { RequestListener, Server } from 'node:http';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

/** A server on an ephemeral port, and the URL of its `/graphql` endpoint. */
export interface Listening {
  readonly server: Server;
  readonly url: string;
  close(): Promise<void>;
}

/** Starts `handler` on a port the OS picks — so parallel suites never collide on one. */
export async function listening(handler: RequestListener): Promise<Listening> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    server,
    url: `http://127.0.0.1:${port}/graphql`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
