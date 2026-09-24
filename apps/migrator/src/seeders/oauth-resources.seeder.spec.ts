import type { MigratorContext } from '../app/bootstrap';
import { bootstrap } from '../app/bootstrap';
import { migrateSystem } from '../main';
import { withSeederContainer } from './container';
import { OAuthResourcesSeeder } from './oauth-resources.seeder';

describe('seeding the resources an OAuth client may ask a token for', () => {
  let context: MigratorContext;

  const runSeeder = () =>
    withSeederContainer(context.app, () =>
      context.orm.seeder.seed(OAuthResourcesSeeder),
    );

  const resources = () =>
    context.orm.em
      .fork()
      .getConnection()
      .execute<{ identifier: string; disabled: boolean }[]>(
        'select identifier, disabled from public.oauth_resource order by identifier',
      );

  beforeAll(async () => {
    await migrateSystem();
    context = await bootstrap();
  });

  afterAll(async () => {
    await context.app.close();
  });

  it('registers the gateway as a resource, once however many times it runs', async () => {
    await runSeeder();
    await runSeeder();

    expect(await resources()).toEqual([
      { identifier: 'http://localhost:4000/graphql', disabled: false },
    ]);
  });
});
