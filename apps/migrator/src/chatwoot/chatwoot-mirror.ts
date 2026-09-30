import type { EntityName, QueryResult } from '@mikro-orm/core';
import type { MikroORM } from '@mikro-orm/postgresql';
import { Logger } from '@nestjs/common';
import { MemberEntitySchema } from '@nestposts/organizations/infrastructure/persistence/entities/member-orm.entity';
import { OrganizationEntitySchema } from '@nestposts/organizations/infrastructure/persistence/entities/organization-orm.entity';
import { TeamMemberEntitySchema } from '@nestposts/organizations/infrastructure/persistence/entities/team-member-orm.entity';
import { TeamEntitySchema } from '@nestposts/organizations/infrastructure/persistence/entities/team-orm.entity';
import { UserEntitySchema } from '@nestposts/users/infrastructure/persistence/entities/user-orm.entity';

export class ChatwootMirror {
  static async backfill(orm: MikroORM): Promise<number> {
    const connection = orm.em.fork().getConnection();
    const [{ present }] = await connection.execute<{ present: boolean }[]>(
      `select to_regclass('chatwoot.users') is not null as present`,
    );
    if (!present) {
      Logger.log('no chatwoot schema: nothing to mirror', 'Migrator');
      return 0;
    }

    let mirrored = 0;
    for (const statement of ChatwootMirror.unmirrored(orm)) {
      const { affectedRows } = await connection.execute<QueryResult>(
        statement,
        [],
        'run',
      );
      mirrored += affectedRows;
    }
    Logger.log(
      `chatwoot mirrored: ${mirrored} row(s) it did not have yet`,
      'Migrator',
    );
    return mirrored;
  }

  private static unmirrored(orm: MikroORM): string[] {
    const table = (entity: EntityName) => ChatwootMirror.tableOf(orm, entity);
    return [
      `update ${table(UserEntitySchema)} as u set name = u.name
        where u.deleted_at is null
          and not exists (select 1 from chatwoot.users c where c.platform_user_id = u.id)`,
      `update ${table(OrganizationEntitySchema)} as o set name = o.name
        where not exists (select 1 from chatwoot.accounts a where a.platform_organization_id = o.id)`,
      `update ${table(MemberEntitySchema)} as m set role = m.role
        where not exists (
          select 1 from chatwoot.account_users au
            join chatwoot.accounts a on a.id = au.account_id
            join chatwoot.users c on c.id = au.user_id
           where a.platform_organization_id = m.organization_id and c.platform_user_id = m.user_id)`,
      `update ${table(TeamEntitySchema)} as t set name = t.name
        where not exists (select 1 from chatwoot.teams c where c.platform_team_id = t.id)`,
      `update ${table(TeamMemberEntitySchema)} as tm set created_at = tm.created_at
        where not exists (
          select 1 from chatwoot.team_members ctm
            join chatwoot.teams ct on ct.id = ctm.team_id
            join chatwoot.users cu on cu.id = ctm.user_id
           where ct.platform_team_id = tm.team_id and cu.platform_user_id = tm.user_id)`,
    ];
  }

  private static tableOf(orm: MikroORM, entity: EntityName): string {
    const meta = orm.getMetadata().get(entity);
    return `"${meta.schema}"."${meta.tableName}"`;
  }
}
