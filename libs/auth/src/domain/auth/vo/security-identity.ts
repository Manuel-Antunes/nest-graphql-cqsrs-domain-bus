import type { IdentityAttribute } from './identity-attribute';

/**
 * **What every caller answers, whatever kind it is** — the behaviour Quarkus' `SecurityIdentity` has:
 * the principal's name, its roles, the scopes its credential was granted and the attributes that
 * credential carried. Each kind of identity is a value object of its own, and this is mixed into both.
 */
export function SecurityIdentity<
  TBase extends abstract new (
    ...args: any[]
  ) => {
    readonly roles: readonly string[];
    readonly scopes: readonly string[];
    readonly attributes: Readonly<Record<string, unknown>>;
  },
>(Base: TBase) {
  abstract class Identified extends Base {
    /** Who the caller is: a user's id, or an OAuth client's. */
    abstract get principal(): string;

    /** Whether the caller holds at least one of `roles`. */
    hasAnyRole(roles: readonly string[]): boolean {
      return roles.some((role) => this.roles.includes(role));
    }

    /** Whether the caller's credential was granted every one of `scopes`. */
    hasScopes(scopes: readonly string[]): boolean {
      return scopes.every((scope) => this.scopes.includes(scope));
    }

    /** One of the credential's attributes, typed — `undefined` when absent or invalid. */
    attribute<T>(attribute: IdentityAttribute<T>): T | undefined {
      return attribute.readFrom(this.attributes);
    }
  }
  return Identified;
}
