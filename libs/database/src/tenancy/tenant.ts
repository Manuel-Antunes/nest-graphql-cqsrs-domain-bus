/**
 * **The tenant a request belongs to, as a name.**
 *
 * One header (`x-tenant`), one attribute on the wire, one default. The value travels as a plain
 * string because it has to cross an HTTP header, an AMQP header and an `AsyncContext` without anyone
 * in the middle having to know what a tenant IS — that is the schema policy's business
 * ({@link TenantSchemas}), and the domain's business never.
 */

/** What an HTTP caller sends, and what goes on the envelope's metadata. One name, both directions. */
export const TENANT_HEADER = 'x-tenant';

/** The tenant of a request that named none. */
export const ROOT_TENANT = 'root';

export class Tenant {
  /**
   * The strings a tenant is never called.
   *
   * `'undefined'` is not paranoia: a producer that interpolates a missing tenant into a header sends
   * the four letters rather than nothing at all, and the far side then looks for a schema named after
   * them. Normalising it back to {@link ROOT_TENANT} is what keeps one forgotten value from becoming
   * a missing-relation error three services away.
   */
  private static readonly NOT_A_TENANT = new Set(['', 'undefined', 'null']);

  /** The tenant name a value stands for — {@link ROOT_TENANT} when it stands for none. */
  static normalize(value: unknown): string {
    const named = Array.isArray(value) ? value[0] : value;
    if (typeof named !== 'string') {
      return ROOT_TENANT;
    }
    const trimmed = named.trim().toLowerCase();
    return Tenant.NOT_A_TENANT.has(trimmed) ? ROOT_TENANT : trimmed;
  }

  static isRoot(tenantId: string): boolean {
    return tenantId === ROOT_TENANT;
  }
}
