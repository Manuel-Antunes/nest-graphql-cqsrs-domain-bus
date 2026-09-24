/**
 * **The tenant a request belongs to, as a name.**
 *
 * One header (`x-tenant`), one attribute on the wire, one default. The value travels as a plain
 * string because it has to cross an HTTP header, an AMQP header and an `AsyncContext` without anyone
 * in the middle having to know what a tenant IS — that is {@link Tenant.schemaOf}'s business, and the
 * domain's business never.
 */

/** What an HTTP caller sends, and what goes on the envelope's metadata. One name, both directions. */
export const TENANT_HEADER = 'x-tenant';

/** The tenant of a request that named none. */
export const ROOT_TENANT = 'root';

/**
 * The prefix a tenant's schema is named with: `tenant_<name>`.
 *
 * Shared, because two things have to agree on it and they are far apart — {@link Tenant.schemaOf},
 * which routes queries there, and the database trigger that CREATES it (`libs/organizations`, on the
 * organization row). One constant is what keeps a rename from silently routing to a schema nobody
 * makes.
 */
export const TENANT_SCHEMA_PREFIX = 'tenant';

/** The root tenant's schema, which the migrator creates and every deploy migrates. */
export const ROOT_TENANT_SCHEMA = `${TENANT_SCHEMA_PREFIX}_${ROOT_TENANT}`;

const STAMPED = Symbol.for('nestposts.database.tenant');

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

  /** The schema a tenant's rows live in: `tenant_<name>`, and `tenant_root` for whoever named none. */
  static schemaOf(tenantId: string): string {
    return `${TENANT_SCHEMA_PREFIX}_${Tenant.normalize(tenantId)}`;
  }

  /** The tenant a schema belongs to — `acme` for `tenant_acme` — and nothing for any other schema. */
  static ofSchema(schema: string | undefined): string | undefined {
    const prefix = `${TENANT_SCHEMA_PREFIX}_`;
    return schema?.startsWith(prefix) ? schema.slice(prefix.length) : undefined;
  }

  /**
   * Marks an object — an event read back from a tenant's log, typically — as belonging to a tenant,
   * for whoever has nothing else to tell it by. Non-enumerable, so it never reaches a payload.
   */
  static stamp<T extends object>(target: T, tenantId: string): T {
    Object.defineProperty(target, STAMPED, {
      value: Tenant.normalize(tenantId),
      enumerable: false,
      configurable: true,
    });
    return target;
  }

  /** The tenant {@link stamp} put on an object, if any. */
  static of(target: object): string | undefined {
    return (target as Record<symbol, string | undefined>)[STAMPED];
  }
}
