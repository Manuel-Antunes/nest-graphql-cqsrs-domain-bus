import { BetterAuthEntities } from '@nestposts/auth/infrastructure/persistence/auth-entities';
import type { EntitySchema } from '@nestposts/database';
import { InvitationNotifier } from '../../domain/organization/invitation.notifier';
import { silentInvitationNotifier } from '../notifier/logging-invitation.notifier';
import { organizationAuthPluginProviders } from '../better-auth/organization-better-auth.plugin';
import { InvitationEntitySchema } from './entities/invitation-orm.entity';
import { MemberEntitySchema } from './entities/member-orm.entity';
import { OrganizationEntitySchema } from './entities/organization-orm.entity';

/** The Better Auth models this module maps by hand, so `@nestposts/auth` does not generate them. */
export const ORGANIZATION_MODELS = ['organization', 'member', 'invitation'] as const;

/** The three tables this module owns, mapped onto its own domain classes. */
export const organizationEntities = [
  OrganizationEntitySchema,
  MemberEntitySchema,
  InvitationEntitySchema,
];

/** What a plugin provider of this module injects, for building it outside the container. */
export const organizationPluginDependencies: readonly (readonly [unknown, unknown])[] = [
  [InvitationNotifier, silentInvitationNotifier],
];

/**
 * **Every table authentication owns in a system that has organizations** — Better Auth's, generated
 * with the organization plugin ON (which is what gives `session` its `active_organization_id`), plus
 * this module's three.
 *
 * One composition point, so `apps/migrator`, the standalone runtime and the modules cannot disagree
 * about which tables exist.
 */
export class OrganizationEntities {
  private static composed: EntitySchema[] | undefined;

  /**
   * Built **once** per process, and handed back on every call.
   *
   * Not an optimisation: the Better Auth tables are *generated*, so a second call produces a second
   * set of `EntitySchema` objects describing the same tables — and MikroORM's entity registry, which
   * `DatabaseModule.forFeature` keeps process-wide, refuses them with `Duplicate table names are not
   * allowed`. A caller can legitimately ask twice: `apps/web` composes this in a module that Next may
   * evaluate in more than one bundle chunk.
   */
  static withAuth(): EntitySchema[] {
    OrganizationEntities.composed ??= [
      ...BetterAuthEntities.forPlugins({
        plugins: organizationAuthPluginProviders,
        mapped: ORGANIZATION_MODELS,
        dependencies: organizationPluginDependencies,
      }),
      ...organizationEntities,
    ];
    return OrganizationEntities.composed;
  }
}

