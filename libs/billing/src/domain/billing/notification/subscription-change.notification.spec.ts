import { renderEmailTemplate } from '@nestposts/mail/email-template';
import { EMAIL_CHANNEL } from '@nestposts/notifications/domain/channel/channel-names';
import { OnDemandNotifiable } from '@nestposts/notifications/domain/notification/on-demand-notifiable';

import { SubscriptionChangeEmail } from '../../../mail/templates/subscription-change.email';
import type { SubscriptionChange } from '../subscription-listener';
import { SubscriptionChangeNotification } from './subscription-change.notification';

const change = (overrides: Partial<SubscriptionChange> = {}) => ({
  event: 'activated' as const,
  subscriptionId: 'sub-1',
  customerId: 'user-1',
  customerEmail: 'ada@mailinator.com',
  planId: 'pro',
  planName: 'Pro',
  endsAt: null,
  ...overrides,
});

const URL = 'http://localhost:4200/settings/billing';

const recipient = OnDemandNotifiable.route(
  EMAIL_CHANNEL,
  'ada@mailinator.com',
  'Ada',
);

describe('SubscriptionChangeNotification', () => {
  it('is keyed by the subscription and the event, so a redelivered webhook emails once', () => {
    expect(SubscriptionChangeNotification.of(change(), URL).key).toBe(
      'sub-1:activated',
    );
    expect(
      SubscriptionChangeNotification.of(change({ event: 'revoked' }), URL).key,
    ).toBe('sub-1:revoked');
  });

  it('goes by email only, with a subject for each event', async () => {
    const subjects = {
      activated: 'Your subscription is active',
      canceled: 'Your subscription was canceled',
      revoked: 'Your subscription has ended',
    } as const;

    for (const [event, subject] of Object.entries(subjects)) {
      const notification = SubscriptionChangeNotification.of(
        change({ event: event as keyof typeof subjects }),
        URL,
      );
      const message = await notification.toMail(recipient).build();

      expect(notification.via()).toEqual([EMAIL_CHANNEL]);
      expect(message.hasSubject(subject)).toBe(true);
    }
  });

  it('tells a cancellation when the plan stops, and links back to billing', async () => {
    const html = await renderEmailTemplate(SubscriptionChangeEmail, {
      name: 'Ada',
      event: 'canceled',
      planName: 'Pro',
      endsAt: '2026-10-24T00:00:00.000Z',
      url: URL,
    });

    expect(html).toContain('Pro stays active until October 24, 2026');
    expect(html).toContain(`href="${URL}"`);
    expect(html).toContain('Hi Ada,');
  });
});
