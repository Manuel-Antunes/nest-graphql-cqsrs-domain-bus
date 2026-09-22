import { inRequestContext } from '@nestposts/database';
import { type AnyMikroORM, closeTestDatabase, testDatabase } from '@nestposts/database/testing';
import { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';
import { Email } from '@nestposts/users/domain/user/vo/email';
import { UserName } from '@nestposts/users/domain/user/vo/user-name';
import { mikroOrmAdapter } from 'better-auth-mikro-orm';
import { AuthUser } from '../../domain/auth/auth-user.entity';
import { AuthConfiguration } from '../better-auth/config';
import { BetterAuthInstance } from '../better-auth/init-auth';
import { BetterAuthPlugins } from '../better-auth/plugins/registry';
import { BETTER_AUTH_CONFIG } from '../better-auth/tokens';
import { authEntities } from './auth-entities';

describe('better-auth writing through the entities this module maps', () => {
  let orm: AnyMikroORM;
  let adapter: ReturnType<ReturnType<typeof mikroOrmAdapter>>;

  const NOW = new Date('2026-09-21T12:00:00.000Z');

  const inContext = <T>(work: () => Promise<T>): Promise<T> => inRequestContext(orm.em, work);

  const found = <T extends object>(entity: { new (): T }, where: object): Promise<T> =>
    inContext(() => orm.em.fork().findOneOrFail(entity, where) as Promise<T>);

  beforeAll(async () => {
    orm = await testDatabase({ entities: authEntities }, 'auth');
    const config = AuthConfiguration.fromEnvironment();
    adapter = mikroOrmAdapter(orm)(
      BetterAuthInstance.optionsFor(
        config,
        BetterAuthPlugins.build(BetterAuthPlugins.providersWith(), [[BETTER_AUTH_CONFIG, config]]),
      ),
    );
  });

  afterAll(() => closeTestDatabase(orm));

  const givenACredential = async (id: string, email: string): Promise<string> => {
    const row = await inContext(() =>
      adapter.create<Record<string, unknown>, { id: string }>({
        model: 'user',
        data: { id, name: 'Manuel', email, emailVerified: false, createdAt: NOW, updatedAt: NOW },
        forceAllowId: true,
      }),
    );
    return row.id;
  };

  it('finds our class by the model name, instead of mapping the table twice', () => {
    const metadata = orm.getMetadata();

    expect(metadata.getByClassName('AuthUser').class).toBe(AuthUser);
    expect(metadata.getByClassName('AuthUser').tableName).toBe('auth_user');
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

    const user = await found(AuthUser, { id: CredentialId.parse('cred_1') });

    expect(user.email).toBeInstanceOf(Email);
    expect(user.email.value).toBe('manuel@example.com');
    expect(user.name).toBeInstanceOf(UserName);
    expect(user.id).toBeInstanceOf(CredentialId);
  });

  it('and better-auth reads it back flat, as the id it wrote', async () => {
    await givenACredential('cred_2', 'ana@example.com');

    const row = await inContext(() =>
      adapter.findOne<Record<string, unknown>>({
        model: 'user',
        where: [{ field: 'email', value: 'ana@example.com' }],
      }),
    );

    expect(row).toMatchObject({ id: 'cred_2', email: 'ana@example.com', name: 'Manuel' });
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

    const user = await found(AuthUser, { id: CredentialId.parse('cred_3') });

    expect(user.name.value).toBe('Rui');
  });
});
