import type { MikroORM } from '@mikro-orm/postgresql';

import type { MigratorContext } from '../app/bootstrap';
import { bootstrap, migrate, mirrorChatwoot } from '../main';

const CHATWOOT_TABLES = `
  create schema chatwoot;
  create table chatwoot.users (
    id serial primary key, name varchar not null, email varchar, uid varchar not null default '',
    provider varchar not null default 'email', encrypted_password varchar not null default '',
    confirmed_at timestamp, type varchar, platform_user_id varchar,
    created_at timestamp not null, updated_at timestamp not null
  );
  create unique index on chatwoot.users (uid, provider);
  create unique index on chatwoot.users (platform_user_id);
  create table chatwoot.accounts (
    id serial primary key, name varchar not null, status integer default 0,
    feature_flags bigint not null default 0, platform_organization_id varchar,
    created_at timestamp not null, updated_at timestamp not null
  );
  create unique index on chatwoot.accounts (platform_organization_id);
  create table chatwoot.account_users (
    id bigserial primary key, account_id bigint, user_id bigint, role integer default 0,
    created_at timestamp not null, updated_at timestamp not null
  );
  create unique index on chatwoot.account_users (account_id, user_id);
  create table chatwoot.teams (
    id bigserial primary key, name varchar not null, account_id bigint not null,
    platform_team_id varchar, created_at timestamp not null, updated_at timestamp not null
  );
  create unique index on chatwoot.teams (name, account_id);
  create unique index on chatwoot.teams (platform_team_id);
  create table chatwoot.team_members (
    id bigserial primary key, team_id bigint not null, user_id bigint not null,
    created_at timestamp not null, updated_at timestamp not null
  );
  create unique index on chatwoot.team_members (team_id, user_id);
  create table chatwoot.conversations (id serial primary key, team_id bigint);
`;

describe('mirroring the platform into Chatwoot', () => {
  let context: MigratorContext;

  const run = (sql: string): Promise<unknown> =>
    context.orm.em.fork().getConnection().execute(sql);

  const rows = <T>(orm: MikroORM, sql: string): Promise<T[]> =>
    orm.em.fork().getConnection().execute<T[]>(sql);

  const insertUser = (id: string, email: string, role = 'user') =>
    run(`insert into public.users (id, email, name, role, created_at, updated_at, version, kind, email_verified)
         values ('${id}', '${email}', '${id} name', '${role}', now(), now(), 1, 'user', true)`);

  const agentOf = async (platformUserId: string) =>
    (
      await rows<{
        name: string;
        email: string;
        uid: string;
        type: string | null;
      }>(
        context.orm,
        `select name, email, uid, type from chatwoot.users where platform_user_id = '${platformUserId}'`,
      )
    )[0];

  const seatOf = async (organizationId: string, platformUserId: string) =>
    (
      await rows<{ role: number }>(
        context.orm,
        `select au.role from chatwoot.account_users au
           join chatwoot.accounts a on a.id = au.account_id
           join chatwoot.users u on u.id = au.user_id
          where a.platform_organization_id = '${organizationId}' and u.platform_user_id = '${platformUserId}'`,
      )
    )[0];

  beforeAll(async () => {
    await migrate();
    context = await bootstrap();
    await insertUser('early-user', 'early@example.com');
    await run(
      `insert into public.organization (id, name, slug, created_at) values ('early-org', 'Early', 'early', now())`,
    );
    await run(
      `insert into public.member (id, organization_id, user_id, role, created_at) values ('early-member', 'early-org', 'early-user', 'admin', now())`,
    );
    await run(
      `insert into public.team (id, name, member_count, organization_id, created_at) values ('early-team', 'Front Desk', 1, 'early-org', now())`,
    );
    await run(
      `insert into public.team_member (id, team_id, user_id, created_at) values ('early-team-member', 'early-team', 'early-user', now())`,
    );
    await run(CHATWOOT_TABLES);
  });

  afterAll(async () => {
    await run('drop schema if exists chatwoot cascade');
    await run(
      `delete from public.member where organization_id in ('early-org', 'seat-org');
       delete from public.organization where id in ('early-org', 'seat-org');
       delete from public.users where id in ('early-user', 'kept-user')`,
    );
    await context.app.close();
  });

  it('mirrors what the platform had before Chatwoot existed, once', async () => {
    expect(await mirrorChatwoot()).toBeGreaterThanOrEqual(5);
    expect(await mirrorChatwoot()).toBe(0);

    expect(await agentOf('early-user')).toMatchObject({
      email: 'early@example.com',
      type: null,
    });
    expect(await seatOf('early-org', 'early-user')).toEqual({ role: 1 });
    expect(
      await rows(
        context.orm,
        `select name from chatwoot.teams where platform_team_id = 'early-team'`,
      ),
    ).toEqual([{ name: 'front desk' }]);
    expect(
      await rows(
        context.orm,
        `select count(*)::int as count from chatwoot.team_members tm
           join chatwoot.teams t on t.id = tm.team_id where t.platform_team_id = 'early-team'`,
      ),
    ).toEqual([{ count: 1 }]);
  });

  it('keeps an agent in step with its user: address, name and the platform admin role', async () => {
    await insertUser('kept-user', 'Kept@Example.com');
    expect(await agentOf('kept-user')).toMatchObject({
      email: 'kept@example.com',
      uid: 'kept@example.com',
    });

    await run(
      `update public.users set email = 'renamed@example.com', name = 'Renamed', role = 'user,admin' where id = 'kept-user'`,
    );

    expect(await agentOf('kept-user')).toEqual({
      name: 'Renamed',
      email: 'renamed@example.com',
      uid: 'renamed@example.com',
      type: 'SuperAdmin',
    });
  });

  it('seats a member as an agent of the account, an administrator only when owner or admin', async () => {
    await run(
      `insert into public.organization (id, name, slug, created_at) values ('seat-org', 'Seats', 'seats', now())`,
    );
    await run(
      `insert into public.member (id, organization_id, user_id, role, created_at) values ('seat-member', 'seat-org', 'kept-user', 'member', now())`,
    );
    expect(await seatOf('seat-org', 'kept-user')).toEqual({ role: 0 });

    await run(
      `update public.member set role = 'owner' where id = 'seat-member'`,
    );
    expect(await seatOf('seat-org', 'kept-user')).toEqual({ role: 1 });

    await run(`delete from public.member where id = 'seat-member'`);
    expect(await seatOf('seat-org', 'kept-user')).toBeUndefined();
  });

  it('takes the agent away when its user is soft deleted', async () => {
    await run(
      `update public.users set deleted_at = now() where id = 'kept-user'`,
    );

    expect(await agentOf('kept-user')).toBeUndefined();
  });

  it('suspends the account of a deleted organization and removes its teams', async () => {
    await run(`delete from public.team_member where team_id = 'early-team'; delete from public.team where id = 'early-team';
               delete from public.member where organization_id = 'early-org'; delete from public.organization where id = 'early-org'`);

    expect(
      await rows(
        context.orm,
        `select status from chatwoot.accounts where platform_organization_id = 'early-org'`,
      ),
    ).toEqual([{ status: 1 }]);
    expect(
      await rows(
        context.orm,
        `select id from chatwoot.teams where platform_team_id = 'early-team'`,
      ),
    ).toEqual([]);
  });
});
