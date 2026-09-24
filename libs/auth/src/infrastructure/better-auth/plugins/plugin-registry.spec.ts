import type { AnyMikroORM } from '@nestposts/database/testing';
import { metadataOnly } from '@nestposts/database/testing';
import { OnDemandNotifications } from '@nestposts/notifications/domain/notification/on-demand-notifications';
import { RecordingOnDemandNotifications } from '@nestposts/notifications/testing/recording-on-demand-notifications';
import { mikroOrmAdapter } from 'better-auth-mikro-orm';

import { authEntities } from '../../persistence/auth-entities';
import { AuthConfiguration } from '../config';
import { BetterAuthEmails } from '../emails/better-auth-emails';
import { BetterAuthInstance } from '../init-auth';
import { BETTER_AUTH_CONFIG } from '../tokens';
import { BetterAuthPlugins } from './registry';

describe('the better-auth plugin registry', () => {
  let orm: AnyMikroORM;

  const build = () => {
    const config = AuthConfiguration.fromEnvironment({
      AUTH_URL: 'http://localhost:3000',
    } as NodeJS.ProcessEnv);
    const notifications = new RecordingOnDemandNotifications();
    const emails = new BetterAuthEmails(notifications);
    const providers = BetterAuthPlugins.providersWith();
    const plugins = BetterAuthPlugins.build(providers, [
      [BETTER_AUTH_CONFIG, config],
      [BetterAuthEmails, emails],
      [OnDemandNotifications, notifications],
    ]);
    return {
      config,
      providers,
      plugins,
      auth: BetterAuthInstance.create(
        config,
        mikroOrmAdapter(orm),
        plugins,
        emails,
      ),
    };
  };

  beforeAll(async () => {
    orm = await metadataOnly(authEntities);
  });

  afterAll(() => orm.close(true));

  it('is the DI registration and the runtime order at once: one provider, one plugin, same index', () => {
    const { providers, plugins } = build();

    expect(plugins).toHaveLength(providers.length);
    expect(plugins.map((plugin) => (plugin as { id: string }).id)).toEqual([
      'admin',
      'jwt',
      'oauth-provider',
      'open-api',
      'magic-link',
      'email-otp',
      'two-factor',
      'multi-session',
      'oauth-bearer-session',
    ]);
  });

  it('every plugin in the tuple puts its endpoints on auth.api', () => {
    const { auth } = build();

    expect(typeof auth.api.userHasPermission).toBe('function');
    expect(typeof auth.api.getOAuthServerConfig).toBe('function');
    expect(typeof auth.api.generateOpenAPISchema).toBe('function');
    expect(typeof auth.api.signInMagicLink).toBe('function');
    expect(typeof auth.api.sendVerificationOTP).toBe('function');
    expect(typeof auth.api.enableTwoFactor).toBe('function');
    expect(typeof auth.api.listDeviceSessions).toBe('function');
  });

  it('carries no organization endpoint: that plugin belongs to the module built on this one', () => {
    const { auth } = build();

    expect(
      (auth.api as Record<string, unknown>).setActiveOrganization,
    ).toBeUndefined();
    expect(
      (auth.api as Record<string, unknown>).createOrganization,
    ).toBeUndefined();
  });

  it('the standalone build resolves the same dependencies the container injects', () => {
    const injected = BetterAuthPlugins.providersWith().flatMap((provider) =>
      'inject' in provider && provider.inject ? [...provider.inject] : [],
    );

    expect(injected.length).toBeGreaterThan(0);
    expect(() => build()).not.toThrow();
  });

  it('refuses a plugin dependency the standalone resolver does not know', () => {
    const config = AuthConfiguration.fromEnvironment({
      AUTH_URL: 'http://localhost:3000',
    } as NodeJS.ProcessEnv);

    expect(() =>
      BetterAuthPlugins.build(
        [
          {
            provide: 'X',
            useFactory: (value: unknown) => value,
            inject: ['NOT_REGISTERED'],
          },
        ],
        [[BETTER_AUTH_CONFIG, config]],
      ),
    ).toThrow(/NOT_REGISTERED/);
  });
});
