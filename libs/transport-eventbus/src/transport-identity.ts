import { Injectable } from '@nestjs/common';

/**
 * **Who this service is on the wire, and whether it speaks.**
 *
 * An application binds it — there is no sensible default for a service's own name, and a wrong one is
 * worse than a missing one: the name is the mark of authorship every message carries, and it is how an
 * event this service produced and got back is recognised and dropped. Two services sharing a name
 * would each ingest the other's echo.
 *
 * ```ts
 * @Injectable()
 * export class PostsApiIdentity extends TransportIdentity {
 *   readonly applicationName = process.env.POSTS_APPLICATION_NAME ?? 'posts-api';
 *   override readonly publishes = process.env.POSTS_PUBLISH_EVENTS !== 'false';
 * }
 * ```
 *
 * It is a class and not an options object because that is what the rest of this repository is: a bean
 * the container resolves, which a test can replace by binding another one, and which can read its own
 * environment instead of being handed a literal at the root module.
 */
@Injectable()
export abstract class TransportIdentity {
  abstract readonly applicationName: string;

  /**
   * The master switch of the outbound half. Off, nothing is forwarded and the application publishes
   * only locally — which is what a suite, or a deployment with the broker down, wants.
   */
  readonly publishes: boolean = true;
}
