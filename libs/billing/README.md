# `@nestposts/billing`

Billing through [Polar](https://polar.sh), as a contribution to the Better Auth instance
`libs/auth` builds — the same way `libs/organizations` contributes the organization plugin. Only
this library knows Polar exists. What the browser sees is better-auth-ui's billing view
(`apps/web/src/components/auth/billing`), fed by an adapter over the endpoints below.

```ts
const billing = billingConfig().polar; // registerAs('billing', () => ({ polar: BillingConfiguration.fromEnvironment(process.env) }))

BetterAuthModule.forRoot({
  plugins: [...organizationAuthPluginProviders, ...BillingInfrastructureModule.authPlugins(billing)],
  imports: [OrganizationsInfrastructureModule, BillingInfrastructureModule.forRoot(billing)],
});
```

The plugins are decided when the module is defined, before any container exists, which is why the
composition root calls its `registerAs` factory directly here rather than injecting it.
`apps/web/src/nest/config/billing.config.ts` is that factory, and the Next side reads the same one to
decide whether to show the billing screens.

`apps/web` is the only composition root that registers it, because the browser only ever talks to
the web's own Better Auth. Nothing here adds a table.

## Configuration

| variable | meaning |
|---|---|
| `POLAR_ACCESS_TOKEN` | an organization access token. **Unset or empty turns billing off entirely**: `fromEnvironment()` answers `null`, `authPlugins` is `[]`, and the module provides nothing |
| `POLAR_ENVIRONMENT` | `sandbox` (the default, also when declared but empty) or `production` |
| `POLAR_WEBHOOK_SECRET` | registers the webhook endpoint when set |

Off-by-default is what CI relies on. Mind that **Nx fills an empty variable from the root `.env`**:
`POLAR_ACCESS_TOKEN= nx run …` still has the token, so `apps/web-e2e` sets the web process's own
environment, which Nx does not reach — billing off, or Polar's sandbox with a webhook endpoint of the
run's own (see **End to end** below).

## What the instance gets

| endpoint | from | what |
|---|---|---|
| `GET /billing/plans` | this library | the catalog, public — plans are not a secret |
| `GET /billing/state` | this library | the caller's subscription and meters |
| `POST /billing/portal` | this library | a customer-portal URL, `{ returnUrl }` a same-origin path |
| `POST /checkout` | `@polar-sh/better-auth` | a checkout for a catalog product, signed-in users only |
| `POST /polar/webhooks` | this library | signature-checked deliveries, handed to the listeners; only with a secret |

### Why the state and the portal are not Polar's plugin

`@polar-sh/better-auth`'s `portal()` and `usage()` are what better-auth-ui's Polar adapter calls, and
this library registers neither, for two measured reasons:

- **`/customer/subscriptions/list?referenceId=…` is not authorized.** With a `referenceId` it lists,
  with the organization's own access token, every subscription whose metadata carries it — for any
  signed-in user, whoever the reference belongs to. On a production account that is one request away
  from another organization's billing.
- **A user with no Polar customer gets a 500.** Every portal endpoint starts with
  `customerSessions.create({ externalCustomerId })`, which throws for an unknown customer, and the
  plugin reports it as a generic `INTERNAL_SERVER_ERROR` — indistinguishable from Polar being down.

`/billing/state` reads `customers.getStateExternal` instead: a customer Polar does not know is simply
a user with no subscription, and **reading it writes nothing**. `/billing/portal` is the one place
that creates a customer, because opening the portal is an explicit request for one. Checkout does
not need one either: Polar creates it from `externalCustomerId` when the checkout completes. Nothing
creates a customer at sign-up (`createCustomerOnSignUp: false`), so the seeder and the e2e suite
never reach Polar.

The return address of the portal must be a path (`/settings/billing`), resolved against the
instance's own origin — a full URL, or `//host`, is refused before Polar is asked, which is what
keeps the endpoint from being an open redirect.

## The catalog

`PolarBillingCatalog` lists every non-archived product and maps each to a plan, cached for five
minutes per process (the checkout's product resolver reads the same cache):

- **The plan id is the product id**, and so is the checkout slug. That is what lets
  better-auth-ui's adapter match a subscription's product back to the plan it is on.
- **Prices**: `fixed`, `free` and `custom` (the preset amount, else the minimum), monthly, yearly or
  one-time. A metered or seat-based price, or a daily or weekly one, is left out — and a product left
  with no price is not a plan.
- **The description is Markdown in Polar and plain text on the card**: its prose becomes the
  description, its list items the features. A description with no list takes the features from the
  product's benefits instead.
- **`highlighted: true`** in a product's metadata marks the plan as the popular one.
- Plans are ordered by their cheapest price.

Meter labels (`customLabel`, else `name`) are cached the same way; a meter's usage is its consumed
units against its credited ones.

## Webhooks: listeners, told what changed

**The endpoint is this library's, not `@polar-sh/better-auth`'s `webhooks()`.** An endpoint created
through Polar's API gets a secret in the Standard Webhooks form, `whsec_<base64>`, whose key is the
decoded bytes; the plugin — and `@polar-sh/sdk`'s `validateEvent`, up to 0.49 — base64-encodes the
secret *text* instead, so no delivery to such an endpoint ever verifies: `No matching signature
found`, a `400` for every event, and nothing reacts. `PolarWebhooks` verifies with `standardwebhooks`
and takes either form — `whsec_…` as is, anything else as the text the SDK expects — then parses the
three subscription events with the SDK's own `$inboundSchema`s.

Three subscription webhooks become a `SubscriptionChange` — `activated` (`subscription.active`),
`canceled` (`subscription.canceled`, the plan running to the end of its period) and `revoked`
(`subscription.revoked`, the plan over) — carrying the subscription, the customer's external id (the
user's id; a subscription with none is ignored), the plan's name and, for the last two, when it ends.
`PolarSubscriptionChanges` hands it to every `SubscriptionListener` the composition root registered:

```ts
BillingInfrastructureModule.forRoot(billing, {
  listeners: [SubscriptionEmails, SubscriptionAuthorship],
});
```

A listener that throws makes the delivery answer `400`, and **Polar retries it** — so a delivery can
arrive twice, late, or after a later one, and every listener has to be right under all three.

- **The email is keyed.** `SubscriptionChangeNotification` (`billing.SubscriptionChange`, email only)
  has the key `<subscription>:<event>`, and an on-demand notification's id is derived from its key
  and its address: the notificator's delivery ledger sends each one once, however many times Polar
  delivered it. The notificator registers the type beside the other notifications.
- **A role is Polar's state, not the event's word.** `apps/web`'s `SubscriptionAuthorship` answers
  every change by asking `BillingAccounts.isSubscribed(user)` and granting `author` while there is an
  active subscription, removing it when there is none — through `IdentityProvider.addRole` /
  `removeRole`, which keep whatever other roles the user holds. Reacting to the event itself would let
  a redelivered `subscription.active` hand the role back after the plan ended.
- **The listeners resolve what Better Auth provides at call time**, through `ModuleRef`: they are
  dependencies of the plugin that builds the instance `IdentityProvider` and `OnDemandNotifications`
  are built from, so injecting those would be a cycle.

## End to end

`apps/web-e2e`'s `billing.spec` drives all of it against **Polar's sandbox**, whenever `.env.test`
(or `E2E_POLAR_ACCESS_TOKEN`) has a sandbox token: a free plan and a paid one are checked out in
Polar's hosted checkout, the subscription is cancelled in the customer portal, its end is asked of
Polar's API, and each webhook comes back through a tunnel to the web. It reads a token for itself and
never the root `.env`'s, and it refuses a `POLAR_ENVIRONMENT` other than `sandbox`. See
`apps/web-e2e/README.md`.

## Not done

- **Organization billing.** better-auth-ui can show billing in organization settings, and Polar
  tags an organization's checkout with a `referenceId`. Turning it on needs an authorization check —
  that the caller may bill that organization — on every endpoint that takes one, which is exactly
  what Polar's plugin does not do.
- **Entitlements beyond the role.** A subscription grants `author`; no feature is gated by which plan.

## Tests

`pnpm nx test @nestposts/billing` — the mapping, the Markdown split, the cache, the configuration,
the account service against a fake client (including that reading the state of an unknown customer
creates nothing), the webhook-to-change translation and the notification's key, subjects and
template.
