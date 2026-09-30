import type { StartedTestContainer } from 'testcontainers';
import { GenericContainer, Wait } from 'testcontainers';

export class ThrowawayNeo4j {
  private static readonly IMAGE = 'neo4j:5.20';
  private static readonly BOLT_PORT = 7687;
  static readonly USER = 'neo4j';
  static readonly PASSWORD = 'throwaway-neo4j';
  static readonly DATABASE = 'neo4j';

  private constructor(private readonly container: StartedTestContainer) {}

  static async start(image = ThrowawayNeo4j.IMAGE): Promise<ThrowawayNeo4j> {
    return new ThrowawayNeo4j(
      await new GenericContainer(image)
        .withEnvironment({
          NEO4J_AUTH: `${ThrowawayNeo4j.USER}/${ThrowawayNeo4j.PASSWORD}`,
        })
        .withExposedPorts(ThrowawayNeo4j.BOLT_PORT)
        .withWaitStrategy(
          Wait.forAll([
            Wait.forLogMessage(/Started\./),
            Wait.forListeningPorts(),
          ]),
        )
        .withStartupTimeout(180_000)
        .start(),
    );
  }

  get uri(): string {
    return `bolt://${this.container.getHost()}:${this.container.getMappedPort(ThrowawayNeo4j.BOLT_PORT)}`;
  }

  async stop(): Promise<void> {
    await this.container.stop({ timeout: 10 });
  }
}
