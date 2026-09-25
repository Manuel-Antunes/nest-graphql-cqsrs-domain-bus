import type { Locator, Page } from '@playwright/test';

import { expect, test } from '../fixtures/test';
import type { Account } from '../support/accounts';
import type { BillingRun } from '../support/billing-stack';
import { WEBHOOK_PATH } from '../support/billing-stack';
import type { E2eProduct } from '../support/polar';
import { PolarCheckout, PolarPortal } from '../support/polar-pages';
import { WEB_URL } from '../support/stack';

const BILLING_PAGE = '/settings/billing';
const WEBHOOK_TO_INBOX_MS = 120_000;
const REDELIVERY_SETTLE_MS = 15_000;

const ACTIVATED = 'Your subscription is active';
const CANCELED = 'Your subscription was canceled';
const REVOKED = 'Your subscription has ended';
const NOT_AN_AUTHOR = 'Esta conta não tem a role author';

const run = (billing: BillingRun | null): BillingRun => {
  if (!billing) {
    throw new Error('this run has no Polar sandbox');
  }
  return billing;
};

const cardTitled = (page: Page, title: string | RegExp): Locator =>
  page.locator('[data-slot="card"]').filter({
    has: page.locator('[data-slot="card-title"]', { hasText: title }),
  });

const subscriptionCard = (page: Page) => cardTitled(page, /^Subscription$/);

const priceOf = ({ amount, currency }: E2eProduct) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount / 100);

const showsSubscription = async (
  page: Page,
  planName: string,
  period: RegExp,
): Promise<void> => {
  await expect(async () => {
    await page.goto(BILLING_PAGE);
    const card = subscriptionCard(page);
    await expect(card.getByText(planName)).toBeVisible({ timeout: 5_000 });
    await expect(card.getByText(period)).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
};

const canWrite = async (page: Page): Promise<void> => {
  await expect(async () => {
    await page.goto('/posts/new');
    await expect(page.getByLabel('Título')).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
};

const cannotWrite = async (page: Page): Promise<void> => {
  await expect(async () => {
    await page.goto('/posts/new');
    await expect(page.getByText(NOT_AN_AUTHOR)).toBeVisible({
      timeout: 5_000,
    });
  }).toPass({ timeout: 60_000 });
};

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
 * `E2E_POLAR_ACCESS_TOKEN` (see `support/billing-stack.ts`).
 */
test.describe
  .serial('billing through Polar', () => {
    test.skip(({ billing }) => billing === null, 'no Polar sandbox token');
    test.describe.configure({ timeout: 240_000 });
    test.use({ locale: 'en-US' });

    let subscriber: Account;
    let buyer: Account;

    test('the plans are the products Polar sells, and nothing is subscribed yet', async ({
      page,
      freshAccount,
      signIn,
      billing,
    }) => {
      const { products } = run(billing);
      subscriber = await freshAccount('Subscriber', {
        domain: 'mailinator.com',
      });
      await signIn(subscriber);

      await page.goto(BILLING_PAGE);

      await expect(
        subscriptionCard(page).getByText('No active subscription'),
      ).toBeVisible();
      for (const product of [products.free, products.pro]) {
        const plan = cardTitled(page, product.name);
        await expect(plan.getByText(priceOf(product))).toBeVisible();
        await expect(plan.getByText('per month')).toBeVisible();
        await expect(
          plan.getByRole('button', { name: 'Choose plan' }),
        ).toBeEnabled();
      }
    });

    test('a free plan is checked out in Polar and comes back as the subscription', async ({
      page,
      signIn,
      billing,
    }) => {
      const { free } = run(billing).products;
      await signIn(subscriber);
      await page.goto(BILLING_PAGE);

      await cardTitled(page, free.name)
        .getByRole('button', { name: 'Choose plan' })
        .click();
      await new PolarCheckout(
        page,
        `${WEB_URL}${BILLING_PAGE}`,
      ).subscribeForFree(subscriber.email);

      await showsSubscription(page, free.name, /^Renews on /);
      await expect(
        subscriptionCard(page).getByText('active', { exact: true }),
      ).toBeVisible();
      await expect(
        cardTitled(page, free.name).getByRole('button', {
          name: 'Current plan',
        }),
      ).toBeDisabled();
    });

    test('the activation webhook makes the subscriber an author, and emails them', async ({
      page,
      signIn,
      mailbox,
    }) => {
      const mail = await mailbox.waitFor(subscriber.email, ACTIVATED, {
        timeout: WEBHOOK_TO_INBOX_MS,
      });
      expect(mail.html).toContain(`${WEB_URL}${BILLING_PAGE}`);

      await signIn(subscriber);
      await canWrite(page);

      await page.getByLabel('Título').fill(`Subscribed ${Date.now()}`);
      await page.getByLabel('Conteúdo').fill('written with a plan');
      await page.getByRole('button', { name: 'Publicar' }).click();
      await expect(
        page.getByRole('link', { name: 'Abrir o post' }),
      ).toBeVisible();
    });

    test('a webhook Polar did not sign is refused, and changes nothing', async ({
      page,
      signIn,
      request,
    }) => {
      const forged = await request.post(`${WEB_URL}${WEBHOOK_PATH}`, {
        headers: {
          'webhook-id': `msg_${Date.now()}`,
          'webhook-timestamp': String(Math.floor(Date.now() / 1000)),
          'webhook-signature': 'v1,Zm9yZ2Vk',
        },
        data: {
          type: 'subscription.revoked',
          data: { customer: { external_id: subscriber.credentialId } },
        },
      });

      expect(forged.status()).toBe(400);
      await signIn(subscriber);
      await canWrite(page);
    });

    test("cancelling in Polar's portal schedules the end of the period, and says so", async ({
      page,
      signIn,
      mailbox,
      billing,
    }) => {
      const { free } = run(billing).products;
      await signIn(subscriber);
      await page.goto(BILLING_PAGE);

      await expect(
        subscriptionCard(page).getByRole('button', {
          name: 'Cancel subscription',
        }),
      ).toHaveCount(0);
      await subscriptionCard(page)
        .getByRole('button', { name: 'Manage billing' })
        .click();
      await new PolarPortal(page).cancelSubscription();

      await showsSubscription(page, free.name, /^Ends on /);
      const mail = await mailbox.waitFor(subscriber.email, CANCELED, {
        timeout: WEBHOOK_TO_INBOX_MS,
      });
      expect(mail.text).toContain(`${free.name} stays active until`);
      await canWrite(page);
    });

    test('the end of the period takes the author role away', async ({
      page,
      signIn,
      mailbox,
      billing,
    }) => {
      const { polar } = run(billing);
      const subscription = await polar.activeSubscriptionOf(
        subscriber.credentialId,
      );
      expect(subscription?.cancelAtPeriodEnd).toBe(true);

      await polar.revoke(subscription?.id as string);

      await mailbox.waitFor(subscriber.email, REVOKED, {
        timeout: WEBHOOK_TO_INBOX_MS,
      });
      await signIn(subscriber);
      await cannotWrite(page);
      await page.goto(BILLING_PAGE);
      await expect(
        subscriptionCard(page).getByText('No active subscription'),
      ).toBeVisible();
    });

    test('an activation delivered again after the end grants nothing and emails nobody', async ({
      page,
      signIn,
      mailbox,
      billing,
    }) => {
      const { polar, webhookEndpoint } = run(billing);
      const deliveriesOf = (eventId: string) =>
        polar
          .deliveries(webhookEndpoint, subscriber.credentialId)
          .then((all) =>
            all.filter((delivery) => delivery.eventId === eventId),
          );
      const activation = (
        await polar.deliveries(webhookEndpoint, subscriber.credentialId)
      ).find((delivery) => delivery.type === 'subscription.active');
      expect(activation?.succeeded).toBe(true);
      const eventId = activation?.eventId as string;

      await polar.redeliver(eventId);

      await expect
        .poll(
          async () =>
            (await deliveriesOf(eventId)).filter(
              (delivery) => delivery.httpCode === 200,
            ).length,
          { timeout: 90_000 },
        )
        .toBe(2);
      await signIn(subscriber);
      await cannotWrite(page);
      await page.waitForTimeout(REDELIVERY_SETTLE_MS);
      const activations = (await mailbox.to(subscriber.email)).filter(
        (mail) => mail.subject === ACTIVATED,
      );
      expect(activations).toHaveLength(1);
    });

    test('a paid plan is bought with a card, and its buyer becomes an author', async ({
      page,
      freshAccount,
      signIn,
      mailbox,
      billing,
    }) => {
      const { pro } = run(billing).products;
      buyer = await freshAccount('Buyer', { domain: 'mailinator.com' });
      await signIn(buyer);
      await page.goto(BILLING_PAGE);

      await cardTitled(page, pro.name)
        .getByRole('button', { name: 'Choose plan' })
        .click();
      await new PolarCheckout(
        page,
        `${WEB_URL}${BILLING_PAGE}`,
      ).subscribeWithCard(buyer.email, buyer.name);

      await showsSubscription(page, pro.name, /^Renews on /);
      await mailbox.waitFor(buyer.email, ACTIVATED, {
        timeout: WEBHOOK_TO_INBOX_MS,
      });
      await canWrite(page);
    });

    test("the portal opens on the buyer's subscription and comes back to billing", async ({
      page,
      signIn,
      billing,
    }) => {
      const { pro } = run(billing).products;
      await signIn(buyer);
      await page.goto(BILLING_PAGE);

      await subscriptionCard(page)
        .getByRole('button', { name: 'Manage billing' })
        .click();

      await page.waitForURL((url) => url.hostname.endsWith('polar.sh'));
      await expect(page.getByText(pro.name).first()).toBeVisible({
        timeout: 60_000,
      });
      await page.getByRole('link', { name: /^Back to / }).click();
      await page.waitForURL(`${WEB_URL}${BILLING_PAGE}`);
      await expect(subscriptionCard(page).getByText(pro.name)).toBeVisible();
    });

    test('Polar delivered every event to the web, and the web accepted every one', async ({
      billing,
    }) => {
      const { polar, webhookEndpoint } = run(billing);
      const typesOf = async (account: Account) => {
        const deliveries = await polar.deliveries(
          webhookEndpoint,
          account.credentialId,
        );
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
