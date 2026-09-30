import type { StartedTestContainer } from 'testcontainers';
import { GenericContainer, Wait } from 'testcontainers';

/**
 * **A Redis of the spec's own**, in a container, on a port Docker picks. Never the one on 6379: that
 * port belongs to whatever else the machine is running, and a spec that writes sessions into another
 * project's Redis is a spec that passes for the wrong reason.
 */
export class ThrowawayRedis {
  private static readonly IMAGE = 'redis:7-alpine';

  private constructor(private readonly container: StartedTestContainer) {}

  /**
   * Starts the container. `image` is for a spec that needs more than plain Redis — the Query
   * Engine behind LangGraph's `RedisStore` ships in `redis:8` and not in the default image.
   */
  static async start(image = ThrowawayRedis.IMAGE): Promise<ThrowawayRedis> {
    return new ThrowawayRedis(
      await new GenericContainer(image)
        .withExposedPorts(6379)
        .withWaitStrategy(
          Wait.forAll([
            Wait.forLogMessage(/Ready to accept connections/),
            Wait.forListeningPorts(),
          ]),
        )
        .start(),
    );
  }

  get url(): string {
    return `redis://${this.container.getHost()}:${this.container.getMappedPort(6379)}`;
  }

  async stop(): Promise<void> {
    await this.container.stop({ timeout: 5 });
  }
}
