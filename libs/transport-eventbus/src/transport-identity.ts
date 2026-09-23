import { Injectable } from '@nestjs/common';

/**
 * **Who this service is on the wire, and whether it speaks.**
 *
 * The name is **not** how a message finds its destination — the `@Publisher`'s client is. It is the
 * mark of authorship every message carries, and the inbound half's answer to "did *I* send this?":
 * a service that binds a namespace it also publishes to receives its own events, and without the mark
 * it ingests them — writing them to its own state again and deciding a second time about a decision it
 * had already taken. Two services sharing a name would each swallow the other's events, which is why
 * there is no default: a wrong name here is worse than a missing one, and a missing one refuses to boot.
 *
 * ```ts
 * { provide: TransportIdentity, useValue: TransportIdentity.named('posts-api') }
 * { provide: TransportIdentity, useValue: TransportIdentity.named('tagging', { publishes: false }) }
 * { provide: TransportIdentity, useValue: TransportIdentity.silent('posts-api-spec') }   // a suite
 * ```
 *
 * It is a class and not an options object because that is what the rest of this repository is: a bean
 * the container resolves, which a test can replace by binding another one. A service whose identity is
 * not a literal — read from a config service, or from a discovery agent — extends it instead.
 */
@Injectable()
export abstract class TransportIdentity {
  abstract readonly applicationName: string;

  /**
   * The master switch of the outbound half. Off, nothing is forwarded and the application publishes
   * only locally — which is what a suite, or a deployment with the broker down, wants.
   */
  readonly publishes: boolean = true;

  /** The identity of a service that publishes under that name. */
  static named(
    applicationName: string,
    options: { publishes?: boolean } = {},
  ): TransportIdentity {
    return new DeclaredIdentity(applicationName, options.publishes ?? true);
  }

  /**
   * The identity of a service that publishes **nothing** — a suite, or an application whose outbound
   * half is turned off. It still needs the name: what it receives is still recognised as its own or
   * somebody else's.
   */
  static silent(applicationName: string): TransportIdentity {
    return new DeclaredIdentity(applicationName, false);
  }
}

class DeclaredIdentity extends TransportIdentity {
  constructor(
    readonly applicationName: string,
    override readonly publishes: boolean,
  ) {
    super();
  }
}
