import type { OnApplicationShutdown } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { RedisClientOptions, RedisClientType } from '@redis/client';
import { createClient } from '@redis/client';

/**
 * **The process's one Redis client, as a DI token.** Everything that talks to Redis injects this and
 * uses {@link RedisConnection.client} — Better Auth's secondary storage, the Nest cache's Keyv store —
 * so a process holds one connection, opened once and closed on shutdown.
 *
 * It is provided by {@link RedisModule}; nothing constructs it but {@link RedisConnection.open}.
 */
export class RedisConnection implements OnApplicationShutdown {
  private static readonly MAX_BACKOFF_MS = 3_000;

  private readonly logger = new Logger(RedisConnection.name);
  private established = false;

  /** The node-redis client. Shared: close it through the application, never by hand. */
  readonly client: RedisClientType;

  private constructor(options: RedisClientOptions) {
    this.client = createClient({
      ...options,
      socket: {
        ...options.socket,
        reconnectStrategy: (retries, cause) =>
          this.reconnectDelay(retries, cause),
      },
    }) as RedisClientType;
    this.client.on('ready', () => {
      this.established = true;
    });
    this.client.on('error', (error: Error) =>
      this.logger.warn(`redis: ${error.message}`),
    );
  }

  /**
   * Connects, and resolves once the server answers.
   *
   * **A server that cannot be reached at boot rejects**, instead of retrying: node-redis' default
   * strategy leaves `connect()` pending forever while the server is down, and a process whose boot
   * waits on it in silence is worse than one that fails naming the address. Once connected, a lost
   * connection is retried with an exponential backoff capped at three seconds.
   */
  static async open(options: RedisClientOptions): Promise<RedisConnection> {
    const connection = new RedisConnection(options);
    await connection.client.connect();
    return connection;
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.close();
    }
  }

  private reconnectDelay(retries: number, cause: Error): number | Error {
    return this.established
      ? Math.min(2 ** retries * 50, RedisConnection.MAX_BACKOFF_MS)
      : cause;
  }
}
