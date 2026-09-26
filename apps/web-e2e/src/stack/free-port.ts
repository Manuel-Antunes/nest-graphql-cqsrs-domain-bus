import { createServer } from 'node:net';

/**
 * A host port nothing is listening on, taken by listening on **zero** and letting the kernel choose.
 *
 * It exists for the two addresses something has to know about itself before it starts: the API's
 * own origin, which it signs cookies against, and the web's. Testcontainers maps a port only after
 * a container is up, which is one round too late for a value the container needs at boot.
 */
export class FreePort {
  static pick(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const probe = createServer();
      probe.once('error', reject);
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address();
        const port =
          typeof address === 'object' && address !== null ? address.port : 0;
        probe.close(() =>
          port === 0 ? reject(new Error('no free port')) : resolve(port),
        );
      });
    });
  }
}
