import type { Provider } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { Notification } from '@nestposts/notifications/domain/notification/notification';
import type { OnDemandNotifiable } from '@nestposts/notifications/domain/notification/on-demand-notifiable';
import { OnDemandNotifications } from '@nestposts/notifications/domain/notification/on-demand-notifications';
import { AUTHOR_ROLE } from '@nestposts/users/domain/user/author.entity';
import { IdentityProvider } from '@nestposts/users/domain/user/identity.provider';
import type { User } from '@nestposts/users/domain/user/user.entity';
import { UserRepository } from '@nestposts/users/domain/user/user.repository';
import { Email } from '@nestposts/users/domain/user/vo/email';
import { UserName } from '@nestposts/users/domain/user/vo/user-name';

import type { BillingConfig } from '../../config/billing.config';
import { billingConfig } from '../../config/billing.config';
import { BillingAccounts } from '../../domain/billing/billing-accounts';
import { BillingEvent } from '../../domain/billing/billing-event';
import { SubscriptionChangeNotification } from '../../domain/billing/notification/subscription-change.notification';
import type { SubscriptionChange } from '../../domain/billing/subscription-change';
import { BillingEventService } from '../events/billing-event.service';
import { SubscriptionAuthorship } from './subscription-authorship.listener';
import { SubscriptionEmails } from './subscription-emails.listener';

const SETTINGS_URL = 'https://posts.example.com/settings/billing';

const aChange = (
  overrides: Partial<SubscriptionChange> = {},
): SubscriptionChange => ({
  event: 'activated',
  subscriptionId: 'sub-1',
  customerId: 'user-1',
  customerEmail: 'polar@example.com',
  planId: 'pro',
  planName: 'Pro',
  endsAt: null,
  ...overrides,
});

describe('the subscription listeners', () => {
  let module: TestingModule;

  const boot = async (providers: Provider[]) => {
    module = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [BillingEventService, ...providers],
    }).compile();
    await module.init();
  };

  const changed = (change: SubscriptionChange) =>
    module
      .get(BillingEventService)
      .emit(BillingEvent.SUBSCRIPTION_CHANGED, change);

  afterEach(() => module?.close());

  describe('SubscriptionAuthorship', () => {
    let subscribed: boolean;
    let asked: Array<[string, string, string]>;
    let failure: Error | null;

    beforeEach(async () => {
      subscribed = true;
      asked = [];
      failure = null;
      const record =
        (verb: string) => async (userId: { value: string }, role: string) => {
          if (failure) {
            throw failure;
          }
          asked.push([verb, userId.value, role]);
        };
      await boot([
        SubscriptionAuthorship,
        {
          provide: BillingAccounts,
          useValue: { isSubscribed: async () => subscribed },
        },
        {
          provide: IdentityProvider,
          useValue: { addRole: record('add'), removeRole: record('remove') },
        },
      ]);
    });

    it('makes a subscriber an author', async () => {
      await changed(aChange());

      expect(asked).toEqual([['add', 'user-1', AUTHOR_ROLE]]);
    });

    it('takes the role back from whoever Polar no longer counts as subscribed', async () => {
      subscribed = false;

      await changed(aChange({ event: 'revoked' }));

      expect(asked).toEqual([['remove', 'user-1', AUTHOR_ROLE]]);
    });

    it('fails the webhook when the role cannot change, so Polar delivers it again', async () => {
      failure = new Error('the database is down');

      await expect(changed(aChange())).rejects.toThrow('the database is down');
    });
  });

  describe('SubscriptionEmails', () => {
    let user: User | null;
    let sent: Array<[OnDemandNotifiable, Notification]>;

    beforeEach(async () => {
      user = null;
      sent = [];
      await boot([
        SubscriptionEmails,
        {
          provide: UserRepository,
          useValue: { findById: async () => user },
        },
        {
          provide: OnDemandNotifications,
          useValue: {
            send: async (
              to: OnDemandNotifiable,
              notification: Notification,
            ) => {
              sent.push([to, notification]);
            },
          },
        },
        {
          provide: billingConfig.KEY,
          useValue: {
            polar: null,
            settingsUrl: SETTINGS_URL,
          } satisfies BillingConfig,
        },
      ]);
    });

    it('emails the user the subscription belongs to, pointing at the billing settings', async () => {
      user = {
        email: Email.parse('ada@example.com'),
        name: UserName.parse('Ada'),
      } as User;

      await changed(aChange());

      const [[to, notification]] = sent;
      expect(to.routeNotificationFor('email')).toBe('ada@example.com');
      expect(to.notifiableName).toBe('Ada');
      expect(notification).toBeInstanceOf(SubscriptionChangeNotification);
      expect(notification.data).toMatchObject({
        event: 'activated',
        planName: 'Pro',
        url: SETTINGS_URL,
      });
    });

    it('falls back to the address Polar has when there is no such user', async () => {
      await changed(aChange());

      const [[to]] = sent;
      expect(to.routeNotificationFor('email')).toBe('polar@example.com');
      expect(to.notifiableName).toBeNull();
    });

    it('sends nothing when nobody has an address', async () => {
      await changed(aChange({ customerEmail: '' }));

      expect(sent).toEqual([]);
    });
  });
});
