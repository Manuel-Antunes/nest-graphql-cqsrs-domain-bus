import { inRequestContext } from '@nestposts/database';
import type { AnyMikroORM } from '@nestposts/database/testing';
import { closeTestDatabase, testDatabase } from '@nestposts/database/testing';
import { OnDemandNotifications } from '@nestposts/notifications/domain/notification/on-demand-notifications';
import { LoggingOnDemandNotifications } from '@nestposts/notifications/infrastructure/on-demand/logging-on-demand-notifications';
import { SoftDeleteSubscriber } from '@nestposts/platform/infrastructure/persistence/soft-delete/soft-delete.subscriber';
import { AUTHOR_ROLE } from '@nestposts/users/domain/user/author.entity';
import { User } from '@nestposts/users/domain/user/user.entity';
import { Email } from '@nestposts/users/domain/user/vo/email';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { UserName } from '@nestposts/users/domain/user/vo/user-name';
import { mikroOrmAdapter } from 'better-auth-mikro-orm';

import { authConfig } from '../../config/auth.config';
import { AuthUser } from '../../domain/auth/auth-user.entity';
import { BetterAuthEmails } from '../better-auth/emails/better-auth-emails';
import { BetterAuthInstance } from '../better-auth/init-auth';
import { BetterAuthPlugins } from '../better-auth/plugins/registry';
import { authEntities } from './auth-entities';

describe('better-auth writing through the entities this module maps', () => {
  let orm: AnyMikroORM;
  let adapter: ReturnType<ReturnType<typeof mikroOrmAdapter>>;

  const NOW = new Date('2026-09-21T12:00:00.000Z');

  const inContext = <T>(work: () => Promise<T>): Promise<T> =>
    inRequestContext(orm.em, work);

  const found = <T extends object>(
    entity: { new (): T },
    where: object,
  ): Promise<T> =>
    inContext(() => orm.em.fork().findOneOrFail(entity, where) as Promise<T>);

  beforeAll(async () => {
    orm = await testDatabase(
      { entities: authEntities, subscribers: [new SoftDeleteSubscriber()] },
      'auth',
    );
    const config = authConfig();
    const emails = BetterAuthEmails.unsent();
    adapter = mikroOrmAdapter(orm)(
      BetterAuthInstance.optionsFor(
        config,
        BetterAuthPlugins.build(BetterAuthPlugins.providersWith(), [
          [authConfig.KEY, config],
          [BetterAuthEmails, emails],
          [OnDemandNotifications, new LoggingOnDemandNotifications()],
        ]),
        emails,
      ),
    );
  });

  afterAll(() => closeTestDatabase(orm));

  const givenACredential = async (
    id: string,
    email: string,
  ): Promise<string> => {
    const row = await inContext(() =>
      adapter.create<Record<string, unknown>, { id: string }>({
        model: 'user',
        data: {
          id,
          name: 'Manuel',
          email,
          emailVerified: false,
          createdAt: NOW,
          updatedAt: NOW,
        },
        forceAllowId: true,
      }),
    );
    return row.id;
  };

  it('finds our class by the model name, instead of mapping the table twice', () => {
    const metadata = orm.getMetadata();

    expect(metadata.getByClassName('AuthUser').class).toBe(AuthUser);
    expect(metadata.getByClassName('AuthUser').tableName).toBe('users');
  });

  it('maps the credential as a kind of User, on the one users table', () => {
    const metadata = orm.getMetadata();

    expect(metadata.getByClassName('AuthUser').root.class).toBe(User);
    expect(metadata.getByClassName('User').tableName).toBe('users');
    expect(metadata.getByClassName('AuthUser').schema).toBe(
      metadata.getByClassName('User').schema,
    );
  });

  it('generates the tables it does NOT map by hand, and only those', () => {
    const names = authEntities.map(
      (entity) =>
        (entity as { meta?: { className: string } }).meta?.className ??
        (entity as { name?: string }).name,
    );

    expect(names.filter((name) => name === 'AuthUser')).toHaveLength(1);
    expect(names).toContain('Session');
    expect(names).toContain('Account');
    expect(names).toContain('Verification');
  });

  it('leaves the organization models to whoever maps them, so nothing is mapped twice', () => {
    const names = authEntities.map(
      (entity) =>
        (entity as { meta?: { className: string } }).meta?.className ??
        (entity as { name?: string }).name,
    );

    expect(names).not.toContain('Organization');
    expect(names).not.toContain('Member');
    expect(names).not.toContain('Invitation');
  });

  it('a row better-auth wrote comes back as the domain entity, value objects included', async () => {
    await givenACredential('cred_1', 'manuel@example.com');

    const user = await found(AuthUser, { id: UserId.parse('cred_1') });

    expect(user.email).toBeInstanceOf(Email);
    expect(user.email.value).toBe('manuel@example.com');
    expect(user.name).toBeInstanceOf(UserName);
    expect(user.id).toBeInstanceOf(UserId);
  });

  it('the same row is the User every other module reads, born at version 1 and alive', async () => {
    await givenACredential('cred_4', 'bia@example.com');

    const user = await found(User, { id: UserId.parse('cred_4') });

    expect(user).toBeInstanceOf(AuthUser);
    expect(user.version).toBe(1);
    expect(user.isDeleted()).toBe(false);
    expect(user.roles).toEqual([]);
  });

  it('the roles better-auth keeps are the roles the User answers for', async () => {
    await givenACredential('cred_5', 'teo@example.com');

    await inContext(() =>
      adapter.update({
        model: 'user',
        where: [{ field: 'id', value: 'cred_5' }],
        update: { role: `user,${AUTHOR_ROLE}` },
      }),
    );

    const user = await found(User, { id: UserId.parse('cred_5') });

    expect(user.roles).toEqual(['user', AUTHOR_ROLE]);
    expect(user.hasRole(AUTHOR_ROLE)).toBe(true);
  });

  it('deleting the account keeps the user, deleted, and frees the address for a new one', async () => {
    await givenACredential('cred_6', 'lia@example.com');

    await inContext(() =>
      adapter.delete({
        model: 'user',
        where: [{ field: 'id', value: 'cred_6' }],
      }),
    );

    const gone = await inContext(() =>
      adapter.findOne({
        model: 'user',
        where: [{ field: 'email', value: 'lia@example.com' }],
      }),
    );
    const kept: User = await inContext(() =>
      orm.em
        .fork()
        .findOneOrFail(
          User,
          { id: UserId.parse('cred_6') },
          { filters: false },
        ),
    );

    expect(gone).toBeNull();
    expect(kept.isDeleted()).toBe(true);
    await expect(givenACredential('cred_7', 'lia@example.com')).resolves.toBe(
      'cred_7',
    );
  });

  it('and better-auth reads it back flat, as the id it wrote', async () => {
    await givenACredential('cred_2', 'ana@example.com');

    const row = await inContext(() =>
      adapter.findOne<Record<string, unknown>>({
        model: 'user',
        where: [{ field: 'email', value: 'ana@example.com' }],
      }),
    );

    expect(row).toMatchObject({
      id: 'cred_2',
      email: 'ana@example.com',
      name: 'Manuel',
    });
  });

  it('an update through better-auth lands on the value-object column', async () => {
    await givenACredential('cred_3', 'rui@example.com');

    await inContext(() =>
      adapter.update({
        model: 'user',
        where: [{ field: 'id', value: 'cred_3' }],
        update: { name: 'Rui' },
      }),
    );

    const user = await found(AuthUser, { id: UserId.parse('cred_3') });

    expect(user.name.value).toBe('Rui');
  });
});
