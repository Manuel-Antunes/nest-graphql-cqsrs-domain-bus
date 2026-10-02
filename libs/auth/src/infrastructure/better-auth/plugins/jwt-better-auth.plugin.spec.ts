import { inRequestContext } from '@nestposts/database';
import type { AnyMikroORM } from '@nestposts/database/testing';
import { closeTestDatabase, testDatabase } from '@nestposts/database/testing';
import { OnDemandNotifications } from '@nestposts/notifications/domain/notification/on-demand-notifications';
import { RecordingOnDemandNotifications } from '@nestposts/notifications/testing/recording-on-demand-notifications';
import { mikroOrmAdapter } from 'better-auth-mikro-orm';

import { authConfig } from '../../../config/auth.config';
import { authEntities } from '../../persistence/auth-entities';
import { DISCOVERY_CACHE_CONTROL } from '../discovery/discovery-cache';
import { BetterAuthEmails } from '../emails/better-auth-emails';
import { BetterAuthInstance } from '../init-auth';
import { BetterAuthPlugins } from './registry';

describe('the JWKS every token is validated against', () => {
  let orm: AnyMikroORM;
  let auth: ReturnType<typeof build>;
  const config = { ...authConfig(), baseUrl: 'http://localhost:4200' };

  const build = () => {
    const notifications = new RecordingOnDemandNotifications();
    const emails = new BetterAuthEmails(notifications);
    const plugins = BetterAuthPlugins.build(BetterAuthPlugins.providersWith(), [
      [authConfig.KEY, config],
      [BetterAuthEmails, emails],
      [OnDemandNotifications, notifications],
    ]);
    return BetterAuthInstance.create(
      config,
      mikroOrmAdapter(orm),
      plugins,
      emails,
    );
  };

  beforeAll(async () => {
    orm = await testDatabase({ entities: authEntities }, 'jwks');
    auth = build();
  });

  afterAll(() => closeTestDatabase(orm));

  it('may be kept by a cache in front of the issuer, and served stale while it refreshes', async () => {
    const response = await inRequestContext(orm.em, () =>
      auth.handler(
        new Request(`${config.baseUrl}${config.basePath}/jwks`, {
          method: 'GET',
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(DISCOVERY_CACHE_CONTROL);
    expect(DISCOVERY_CACHE_CONTROL).toContain('stale-while-revalidate');
    expect(((await response.json()) as { keys: unknown[] }).keys.length).toBe(
      1,
    );
  });
});
