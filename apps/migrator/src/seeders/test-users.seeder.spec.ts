import type { BetterAuth } from '@nestposts/auth/infrastructure/better-auth/init-auth';
import { AuthUser } from '@nestposts/auth/domain/auth/auth-user.entity';
import { BETTER_AUTH } from '@nestposts/auth/infrastructure/better-auth/tokens';
import { inRequestContext } from '@nestposts/database';
import { dropTestSchema, ensureTestSchema } from '@nestposts/database/testing';
import { Email } from '@nestposts/users/domain/user/vo/email';

import type { MigratorContext } from '../app/bootstrap';
import { bootstrap } from '../app/bootstrap';
import { PostsMigratorModule } from '../app/posts.module';
import { withSeederContainer } from './container';
import {
  SEED_PASSWORD,
  seededUsers,
  TestUsersSeeder,
} from './test-users.seeder';

describe('seeding the users the system should have', () => {
  let context: MigratorContext;

  const runSeeder = () =>
    withSeederContainer(context.app, () =>
      context.orm.seeder.seed(TestUsersSeeder),
    );

  const credentials = () =>
    context.orm.em
      .fork()
      .getConnection()
      .execute<
        {
          email: string;
          provider_id: string;
          role: string | null;
          password: string | null;
        }[]
      >(
        `select u.email, u.role, a.provider_id, a.password
         from "${context.orm.config.get('schema')}".auth_user u
         join "${context.orm.config.get('schema')}".account a on a.user_id = u.id
        order by u.email`,
      );

  beforeAll(async () => {
    context = await bootstrap(PostsMigratorModule);
    await ensureTestSchema(context.orm);
    await runSeeder();
  });

  afterAll(async () => {
    await dropTestSchema(context.orm);
    await context.app.close();
  });

  it('creates every user it declares, each with a credential account', async () => {
    const rows = await credentials();

    expect(rows.map((row) => row.email)).toEqual(
      seededUsers()
        .map((user) => user.email)
        .sort(),
    );
    expect(rows.every((row) => row.provider_id === 'credential')).toBe(true);
    expect(rows.every((row) => Boolean(row.password))).toBe(true);
  });

  it('gives the author its role, which is what a write is authorised against', async () => {
    const rows = await credentials();

    expect(rows.find((row) => row.email === 'manuel@example.com')?.role).toBe(
      'author',
    );
    expect(
      rows.find((row) => row.email === 'promovido@example.com')?.role,
    ).toBe('author');
    expect(
      rows.find((row) => row.email === 'leitor@example.com')?.role,
    ).not.toBe('author');
  });

  it('seeds a credential that actually signs in, which inserting rows would not', async () => {
    const auth = context.app.get<BetterAuth>(BETTER_AUTH);

    const signedIn = await inRequestContext(context.orm, () =>
      auth.api.signInEmail({
        body: { email: 'manuel@example.com', password: SEED_PASSWORD },
      }),
    );

    expect(signedIn.user.email).toBe('manuel@example.com');
  });

  it('is safe to run on every deploy: a second pass adds nobody', async () => {
    await runSeeder();

    const found = await context.orm.em.fork().find(AuthUser, {
      email: { $in: seededUsers().map((user) => Email.parse(user.email)) },
    });
    expect(found).toHaveLength(seededUsers().length);
  });
});
