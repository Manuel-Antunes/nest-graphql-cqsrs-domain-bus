import { OnDemandNotifications } from '@nestposts/notifications/domain/notification/on-demand-notifications';
import { LoggingOnDemandNotifications } from '@nestposts/notifications/infrastructure/on-demand/logging-on-demand-notifications';

import { AuthConfiguration } from './config';
import { BetterAuthEmails } from './emails/better-auth-emails';
import { BetterAuthInstance } from './init-auth';
import { BetterAuthPlugins } from './plugins/registry';
import { BETTER_AUTH_CONFIG } from './tokens';

describe('BetterAuthInstance', () => {
  const config = AuthConfiguration.fromEnvironment();
  const emails = BetterAuthEmails.unsent();
  const options = BetterAuthInstance.optionsFor(
    config,
    BetterAuthPlugins.build(BetterAuthPlugins.providersWith(), [
      [BETTER_AUTH_CONFIG, config],
      [BetterAuthEmails, emails],
      [OnDemandNotifications, new LoggingOnDemandNotifications()],
    ]),
    emails,
  );
  const creating = (user: { email: string; name: string }) =>
    options.databaseHooks.user.create.before({
      ...user,
      id: 'cred_1',
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  it('names a user created without a name after the local part of their email', async () => {
    await expect(
      creating({ email: 'ana.silva@example.com', name: '' }),
    ).resolves.toEqual({
      data: expect.objectContaining({
        email: 'ana.silva@example.com',
        name: 'ana.silva',
      }),
    });
  });

  it('keeps the name a user was created with', async () => {
    await expect(
      creating({ email: 'ana.silva@example.com', name: '  Ana  ' }),
    ).resolves.toEqual({
      data: expect.objectContaining({ name: 'Ana' }),
    });
  });
});
