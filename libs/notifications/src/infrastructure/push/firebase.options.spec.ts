import type { PushNotifications } from '../../domain/channel/push-notifications';
import { firebasePushOptionsFromEnv } from './firebase.options';
import { UnconfiguredPushNotifications } from './unconfigured-push-notifications';

const serviceAccount = {
  project_id: 'nestposts',
  client_email: 'push@nestposts.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----\n',
};

describe('firebasePushOptionsFromEnv', () => {
  it('leaves push unconfigured without credentials', () => {
    expect(firebasePushOptionsFromEnv({})).toBeNull();
  });

  it('reads the service account from its JSON', () => {
    expect(
      firebasePushOptionsFromEnv({
        FIREBASE_CREDENTIALS: JSON.stringify(serviceAccount),
      }),
    ).toEqual({ credentials: serviceAccount });
  });

  it('refuses credentials that are not a service account', () => {
    expect(() =>
      firebasePushOptionsFromEnv({ FIREBASE_CREDENTIALS: 'not json' }),
    ).toThrow();
    expect(() =>
      firebasePushOptionsFromEnv({
        FIREBASE_CREDENTIALS: JSON.stringify({ project_id: 'x' }),
      }),
    ).toThrow();
  });
});

describe('UnconfiguredPushNotifications', () => {
  it('sends nothing and reports no failure, because a retry would change nothing', async () => {
    const push: PushNotifications = new UnconfiguredPushNotifications();

    await expect(
      push.send(['token'], { notification: { title: 't', body: 'b' } }),
    ).resolves.toEqual({ delivered: 0, failed: [] });
  });
});
