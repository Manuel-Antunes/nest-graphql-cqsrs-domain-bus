import { Injectable } from '@nestjs/common';

import { Tenant } from './tenant';

/**
 * The prefix a tenant's schema is named with: `tenant_<name>`.
 *
 * Shared, because two things have to agree on it and they are far apart — {@link SchemaPerTenant},
 * which routes queries there, and the database trigger that CREATES it (`libs/organizations`, on the
 * organization row). One constant is what keeps a rename from silently routing to a schema nobody
 * makes.
 */
export const TENANT_SCHEMA_PREFIX = 'tenant';

/**
 * **Which schema a tenant's rows live in** — the one decision that separates "the tenant is a label
 * the request carries" from "the tenant is where the data is".
 *
 * `undefined` means *the connection's own schema*, which is what this repository's single-schema
 * services want: the tenant still travels, still scopes the context and still shows up in the logs,
 * but every tenant reads the same tables.
 *
 * Whatever a policy returns, **no schema is created here**. DDL belongs to `apps/migrator` and to the
 * trigger that ships through it: a policy that names a schema nobody migrated fails on the first
 * query, which is the honest answer and the same one a service whose migrations never ran gets.
 */
@Injectable()
export abstract class TenantSchemas {
  /** The schema a tenant's rows live in, under {@link TENANT_SCHEMA_PREFIX}. */
  static nameFor(
    tenantId: string,
    prefix: string = TENANT_SCHEMA_PREFIX,
  ): string {
    return `${prefix}_${tenantId}`;
  }

  abstract schemaFor(tenantId: string): string | undefined;
}

/** Every tenant shares the connection's schema: the tenant is a label, not a location. */
@Injectable()
export class SharedSchemaTenants extends TenantSchemas {
  schemaFor(_tenantId: string): undefined {
    return undefined;
  }
}

/**
 * A schema per tenant, named `<prefix>_<tenant>`, with the root tenant staying on the connection's
 * own. The schemas have to exist already — see {@link TenantSchemas}.
 */
export class SchemaPerTenant extends TenantSchemas {
  constructor(private readonly prefix: string = TENANT_SCHEMA_PREFIX) {
    super();
  }

  schemaFor(tenantId: string): string | undefined {
    return Tenant.isRoot(tenantId)
      ? undefined
      : TenantSchemas.nameFor(tenantId, this.prefix);
  }
}
