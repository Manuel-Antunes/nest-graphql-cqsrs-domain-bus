import type { RequestListener, Server } from 'node:http';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export class Listening {
  private constructor(
    readonly server: Server,
    readonly url: string,
  ) {}

  static async on(handler: RequestListener): Promise<Listening> {
    const server = createServer(handler);
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const { port } = server.address() as AddressInfo;
    return new Listening(server, `http://127.0.0.1:${port}/graphql`);
  }

  close(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.server.closeAllConnections();
      this.server.close(() => resolve());
    });
  }
}
