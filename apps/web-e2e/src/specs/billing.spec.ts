import { expect, test } from '../fixtures/test';
import { BillingRun } from '../infrastructure/polar/billing-run';
import type { Account } from '../model/account';
import { EmailSubject } from '../model/email';
import { Poll } from '../support/poll';

const WEBHOOK_TO_INBOX_MS = 120_000;
const REDELIVERY_SETTLE_MS = 15_000;

/**
 * **Billing, the whole way round, against Polar's sandbox** — the settings screen, Polar's hosted
 * checkout and customer portal, and the webhooks Polar sends back through this run's tunnel.
 *
 * What the web does with a webhook is what this is about: a subscription that becomes active makes its
 * customer an AUTHOR and tells them so by email, a cancellation is only an email — the plan runs to the
 * end of the period — and the end of the period takes the role away. Nothing here fakes Polar: the
 * checkout is filled in a browser, the cancellation is clicked in the portal, and the end of the period
 * is the one thing that cannot be waited for, so it is asked of Polar's API — which then sends the same
 * webhook the passing of a month would.
 *
 * The role is Polar's STATE, not the event's word: every subscription webhook re-reads the customer
 * and grants or removes the role by whether they still hold an active subscription. That is what
 * makes a redelivered or late event harmless, and the redelivery below is the proof.
 *
 * It runs only when the stack came up with billing — a sandbox token in `.env.test` or
 * `E2E_POLAR_ACCESS_TOKEN` (see `stack/billing-stack.ts`).
 */
test.describe
  .serial('billing through Polar', () => {
    test.skip(({ billing }) => billing === null, 'no Polar sandbox token');
    test.describe.configure({ timeout: 240_000 });
    test.use({ locale: 'en-US' });

    let subscriber: Account;
    let buyer: Account;

    test('the plans are the products Polar sells, and nothing is subscribed yet', async ({
      app,
      registration,
      authentication,
      billing,
    }) => {
      const { products } = BillingRun.required(billing);
      subscriber = await registration.freshAccount('Subscriber', {
        domain: 'mailinator.com',
      });
      await authentication.signIn(subscriber);

      await app.billingSettings.open();

      await expect(app.billingSettings.subscription.none).toBeVisible();
      for (const product of [products.free, products.pro]) {
        const plan = app.billingSettings.plan(product.name);
        await expect(plan.price(product)).toBeVisible();
        await expect(plan.perMonth).toBeVisible();
        await expect(plan.chooseButton).toBeEnabled();
      }
    });

    test('a free plan is checked out in Polar and comes back as the subscription', async ({
      app,
      authentication,
      subscriptions,
      billing,
    }) => {
      const { free } = BillingRun.required(billing).products;
      await authentication.signIn(subscriber);

      await subscriptions.subscribeForFree(free, subscriber.email);

      await app.billingSettings.untilSubscriptionShows(
        free.name,
        /^Renews on /,
      );
      await expect(app.billingSettings.subscription.active).toBeVisible();
      await expect(
        app.billingSettings.plan(free.name).currentPlanButton,
      ).toBeDisabled();
    });

    test('the activation webhook makes the subscriber an author, and emails them', async ({
      app,
      authentication,
      mailbox,
      subscriptions,
    }) => {
      const mail = await mailbox.waitFor(
        subscriber.email,
        EmailSubject.SUBSCRIPTION_ACTIVE,
        { timeout: WEBHOOK_TO_INBOX_MS },
      );
      expect(mail.html).toContain(subscriptions.billingUrl);

      await authentication.signIn(subscriber);
      await app.newPost.untilAuthorized();

      const postId = await app.newPost.publish({
        title: `Subscribed ${Date.now()}`,
        content: 'written with a plan',
      });
      expect(postId).toMatch(/^[0-9a-f-]{36}$/);
    });

    test('a webhook Polar did not sign is refused, and changes nothing', async ({
      app,
      authentication,
      billingWebhooks,
    }) => {
      const status = await billingWebhooks.forge(
        'subscription.revoked',
        subscriber.credentialId,
      );

      expect(status).toBe(400);
      await authentication.signIn(subscriber);
      await app.newPost.untilAuthorized();
    });

    test("cancelling in Polar's portal schedules the end of the period, and says so", async ({
      app,
      authentication,
      subscriptions,
      mailbox,
      billing,
    }) => {
      const { free } = BillingRun.required(billing).products;
      await authentication.signIn(subscriber);
      await app.billingSettings.open();
      await expect(app.billingSettings.subscription.cancelButton).toHaveCount(
        0,
      );

      await subscriptions.cancelInThePortal();

      await app.billingSettings.untilSubscriptionShows(free.name, /^Ends on /);
      const mail = await mailbox.waitFor(
        subscriber.email,
        EmailSubject.SUBSCRIPTION_CANCELED,
        { timeout: WEBHOOK_TO_INBOX_MS },
      );
      expect(mail.text).toContain(`${free.name} stays active until`);
      await app.newPost.untilAuthorized();
    });

    test('the end of the period takes the author role away', async ({
      app,
      authentication,
      mailbox,
      billing,
    }) => {
      const { polar } = BillingRun.required(billing);
      const subscription = await polar.activeSubscriptionOf(
        subscriber.credentialId,
      );
      expect(subscription?.cancelAtPeriodEnd).toBe(true);

      await polar.revoke(subscription?.id as string);

      await mailbox.waitFor(subscriber.email, EmailSubject.SUBSCRIPTION_ENDED, {
        timeout: WEBHOOK_TO_INBOX_MS,
      });
      await authentication.signIn(subscriber);
      await app.newPost.untilRefused();
      await app.billingSettings.open();
      await expect(app.billingSettings.subscription.none).toBeVisible();
    });

    test('an activation delivered again after the end grants nothing and emails nobody', async ({
      app,
      authentication,
      mailbox,
      billing,
    }) => {
      const run = BillingRun.required(billing);
      const activation = (await run.deliveriesTo(subscriber)).find(
        (delivery) => delivery.type === 'subscription.active',
      );
      expect(activation?.succeeded).toBe(true);
      const eventId = activation?.eventId as string;

      await run.polar.redeliver(eventId);

      await expect
        .poll(
          async () =>
            (await run.deliveriesOf(subscriber, eventId)).filter(
              (delivery) => delivery.httpCode === 200,
            ).length,
          { timeout: 90_000 },
        )
        .toBe(2);
      await authentication.signIn(subscriber);
      await app.newPost.untilRefused();
      await Poll.pause(REDELIVERY_SETTLE_MS);
      expect(
        await mailbox.withSubject(
          subscriber.email,
          EmailSubject.SUBSCRIPTION_ACTIVE,
        ),
      ).toHaveLength(1);
    });

    test('a paid plan is bought with a card, and its buyer becomes an author', async ({
      app,
      registration,
      authentication,
      subscriptions,
      mailbox,
      billing,
    }) => {
      const { pro } = BillingRun.required(billing).products;
      buyer = await registration.freshAccount('Buyer', {
        domain: 'mailinator.com',
      });
      await authentication.signIn(buyer);

      await subscriptions.subscribeWithCard(pro, buyer);

      await app.billingSettings.untilSubscriptionShows(pro.name, /^Renews on /);
      await mailbox.waitFor(buyer.email, EmailSubject.SUBSCRIPTION_ACTIVE, {
        timeout: WEBHOOK_TO_INBOX_MS,
      });
      await app.newPost.untilAuthorized();
    });

    test("the portal opens on the buyer's subscription and comes back to billing", async ({
      app,
      authentication,
      subscriptions,
      billing,
    }) => {
      const { pro } = BillingRun.required(billing).products;
      await authentication.signIn(buyer);

      const portal = await subscriptions.openPortal();

      await expect(portal.plan(pro.name)).toBeVisible({ timeout: 60_000 });
      await subscriptions.returnFromThePortal();
      await expect(
        app.billingSettings.subscription.plan(pro.name),
      ).toBeVisible();
    });

    test('Polar delivered every event to the web, and the web accepted every one', async ({
      billing,
    }) => {
      const run = BillingRun.required(billing);
      const typesOf = async (account: Account) => {
        const deliveries = await run.deliveriesTo(account);
        expect(
          deliveries.filter((delivery) => delivery.httpCode !== 200),
        ).toEqual([]);
        return new Set(deliveries.map((delivery) => delivery.type));
      };

      await expect
        .poll(async () => [...(await typesOf(subscriber))].sort(), {
          timeout: 60_000,
        })
        .toEqual(
          expect.arrayContaining([
            'subscription.active',
            'subscription.canceled',
            'subscription.revoked',
          ]),
        );
      await expect
        .poll(async () => [...(await typesOf(buyer))].sort(), {
          timeout: 60_000,
        })
        .toEqual(expect.arrayContaining(['subscription.active', 'order.paid']));
    });
  });
