import type { MigratorContext } from '../app/bootstrap';
import { bootstrap } from '../app/bootstrap';
import { migrateSystem } from '../main';
import { AgentConsoleClientSeeder } from './agent-console-client.seeder';
import { withSeederContainer } from './container';

describe('seeding the public client an agent console signs people in with', () => {
  let context: MigratorContext;

  const runSeeder = () =>
    withSeederContainer(context.app, () =>
      context.orm.seeder.seed(AgentConsoleClientSeeder),
    );

  const clients = () =>
    context.orm.em
      .fork()
      .getConnection()
      .execute<
        {
          client_id: string;
          client_secret: string | null;
          skip_consent: boolean;
          redirect_uris: string;
          token_endpoint_auth_method: string;
          application_type: string;
          require_pkce: boolean;
        }[]
      >(
        `select client_id, client_secret, skip_consent, redirect_uris, token_endpoint_auth_method,
                application_type, require_pkce
           from public.oauth_client where client_id = ?`,
        [AgentConsoleClientSeeder.CLIENT_ID],
      );

  beforeAll(async () => {
    await migrateSystem();
    context = await bootstrap();
  });

  afterAll(async () => {
    await context.app.close();
  });

  it('registers it once, public, native and bound to PKCE, however many times it runs', async () => {
    await runSeeder();
    await runSeeder();

    expect(await clients()).toEqual([
      {
        client_id: AgentConsoleClientSeeder.CLIENT_ID,
        client_secret: null,
        skip_consent: true,
        redirect_uris: JSON.stringify([AgentConsoleClientSeeder.REDIRECT_URI]),
        token_endpoint_auth_method: 'none',
        application_type: 'native',
        require_pkce: true,
      },
    ]);
  });
});
