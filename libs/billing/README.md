# `@nestposts/billing`

Billing through [Polar](https://polar.sh), as a contribution to the Better Auth instance
`libs/auth` builds — the same way `libs/organizations` contributes the organization plugin. Only
this library knows Polar exists. What the browser sees is better-auth-ui's billing view
(`apps/web/src/components/auth/billing`), in the user's settings and in each organization's, fed by
better-auth-ui's own Polar adapter over the endpoints below.

```ts
EventEmitterModule.forRoot(),
BetterAuthModule.forRoot({
  plugins: [...organizationAuthPluginProviders, ...BillingInfrastructureModule.authPlugins()],
  imports: [OrganizationsInfrastructureModule, BillingInfrastructureModule],
});
```

**A plain module that owns its configuration.** `BillingInfrastructureModule` is an ordinary
`@Module`: it registers `billingConfig` — the `registerAs` in `src/config/billing.config.ts`, reading
`process.env` — with `ConfigModule.forFeature` and exports it, provides the Polar client, the catalog,
the accounts, the event service, `BillingService` and **its own listeners**, and imports
`UsersInfrastructureModule` for them. The schema it parses is `src/config/billing-env.schema.ts`, Zod
alone, which is what lets `apps/web/src/env.mjs` spread it: that file reaches the browser bundle, and
`billing.config.ts` imports `@nestjs/config`, whose `dotenv` asks for `fs` and `child_process`. The application imports it and loads nothing. The plugins are the one thing decided before a
container exists — they are part of `BetterAuthModule.forRoot`'s definition — so `authPlugins()`
calls `billingConfig()` directly, and so does the Next side (`WebAuth.billingEnabled()`) to decide
whether to show the billing screens.

`apps/web` is the only composition root that registers it, because the browser only ever talks to
the web's own Better Auth. It needs `EventEmitterModule.forRoot()` at its root (see **Webhooks**).
Nothing here adds a table.

## Configuration

| variable | meaning |
|---|---|
| `POLAR_ACCESS_TOKEN` | an organization access token. **Unset or empty turns billing off entirely**: `billingConfig().polar` is `null` and `authPlugins()` is `[]`, so no endpoint exists and nothing ever reaches Polar or the listeners |
| `POLAR_ENVIRONMENT` | `sandbox` (the default, also when declared but empty) or `production` |
| `POLAR_WEBHOOK_SECRET` | registers the webhook endpoint when set |
| `WEB_URL` | where the web lives (default `http://localhost:4200`): the subscription emails link to its `/settings/billing` |

Off-by-default is what CI relies on. Mind that **Nx fills an empty variable from the root `.env`**:
`POLAR_ACCESS_TOKEN= nx run …` still has the token, so `apps/web-e2e` sets the web process's own
environment, which Nx does not reach — billing off, or Polar's sandbox with a webhook endpoint of the
run's own (see **End to end** below).

## What the instance gets

Everything a signed-in user does with their billing is `@polar-sh/better-auth`'s own plugin —
`polar({ createCustomerOnSignUp: false, use: [checkout(), portal(), usage()] })` — and
better-auth-ui's own Polar adapter (`createPolarBillingAdapter`) talks to it from the browser. This
library adds what the plugin does not have: the catalog, two checks the plugin skips, and the
webhook endpoint.

| endpoint | from | what |
|---|---|---|
| `GET /billing/plans` | this library | the catalog, public — plans are not a secret, and the plugin cannot list them |
| `POST /checkout` | `checkout()` | a checkout for a catalog product, signed-in users only, `referenceId` for an organization |
| `/customer/portal`, `/customer/state`, `/customer/subscriptions/list`, `/customer/orders/list`, `/customer/benefits/list` | `portal()` | the caller's portal URL (back to `settingsUrl`), state and lists — or an organization's subscriptions, by `referenceId` |
| `GET /usage/meters/list`, `POST /usage/ingest` | `usage()` | the caller's meters, and an event ingested for the caller |
| `POST /polar/webhooks` | this library | signature-checked deliveries, emitted to the listeners; only with a secret |

### What the plugin does not check, and this library does — with Better Auth's own pieces

Both are `hooks.before` of this library's `nestposts-billing` plugin, so they run for the browser's
requests and for `auth.api.*` calls alike.

- **A `referenceId` is authorized.** The plugin passes it straight through: with one,
  `/customer/subscriptions/list` lists every subscription whose metadata carries it, with the
  organization's own access token, for any signed-in user, and `/checkout` stamps it on anybody's
  checkout. The hook lets the caller's own id through and hands any other to Better Auth's
  `requireOrgRole` — reading needs a membership of that organization, buying for it needs `owner` or
  `admin` — which answers `FORBIDDEN` (`Not a member of this organization`, `Insufficient role for this
  operation`) before Polar is asked.
- **A user Polar does not know is made a customer, when they first use billing.** Every `portal()`
  and `usage()` endpoint starts with `customerSessions.create({ externalCustomerId })`, which throws
  for an unknown customer, and the plugin reports that as a generic `INTERNAL_SERVER_ERROR`. So
  before any `/customer/*` or `/usage/*` call the hook runs `BillingAccounts.ensureCustomer`, which
  creates the customer under the user's id when Polar has none and remembers, per process, who it
  already asked about. Checkout needs no customer: Polar makes one from `externalCustomerId`.

**`createCustomerOnSignUp` is off, and that is measured.** With it on, the plugin creates the Polar
customer inside the sign-up, and a sign-up Polar refuses is a sign-up that fails: the full e2e run
died in its global setup with `Polar customer creation failed … example.com does not accept email`,
a `500` on registering `autor@example.com` — and the same holds for every sign-up while Polar is
down. Signing up must not depend on the billing provider. The price is the plugin's other two hooks,
which that one flag also switches off: Polar's copy of a customer's email and name stays as it was
when the customer was made, and deleting the account leaves the customer in Polar.

### On the server: `BillingService`

`BillingService` (`src/infrastructure/better-auth/billing.service.ts`) is request-scoped, like
`AuthService`: it takes the request's headers and calls the plugin's own endpoints through `auth.api`
— `state()`, `portalUrl()`, `subscriptions({ referenceId? })`, `orders()`, `benefits()`, `meters()`,
`ingest(event, metadata)`, `checkoutUrl({ ... })` — so what it answers is scoped to the caller by the
plugin, and the checks above apply to it too. `apps/web` resolves it with `WebAuth.billing()`. It is
not the webhook's: a delivery has no session, so `SubscriptionAuthorship` asks `BillingAccounts`.

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

## Webhooks: an event, and the listeners that take it

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
`PolarSubscriptionChanges` emits it as `BillingEvent.SUBSCRIPTION_CHANGED` on `@nestjs/event-emitter`
(`BillingEventService`, `emitAsync`), and this module's own listeners take it with
`@OnEvent(BillingEvent.SUBSCRIPTION_CHANGED, { suppressErrors: false })`:
`SubscriptionEmails` and `SubscriptionAuthorship` (`src/infrastructure/listeners`).

- **An event, because a list of listeners was a cycle.** `SubscriptionAuthorship` needs
  `IdentityProvider`, which needs the Better Auth instance, which is built from the plugins — the
  webhook plugin among them, which needed the listeners. The listeners used to break it by resolving
  their dependencies through `ModuleRef` at call time. The plugin now depends on the emitter alone,
  and the listeners inject what they use like any other provider.
- **`suppressErrors: false` is not optional.** `@nestjs/event-emitter` catches and logs what a
  handler throws unless told otherwise, and then the delivery would answer `200` for a change nobody
  applied. With it, `emitAsync` rejects, the delivery answers `400`, and **Polar retries it** — so a
  delivery can arrive twice, late, or after a later one, and every listener has to be right under
  all three.

- **The email is keyed.** `SubscriptionChangeNotification` (`billing.SubscriptionChange`, email only)
  has the key `<subscription>:<event>`, and an on-demand notification's id is derived from its key
  and its address: the notificator's delivery ledger sends each one once, however many times Polar
  delivered it. The notificator registers the type beside the other notifications.
- **A role is Polar's state, not the event's word.** `SubscriptionAuthorship` answers
  every change by asking `BillingAccounts.isSubscribed(user)` and granting `author` while there is an
  active subscription, removing it when there is none — through `IdentityProvider.addRole` /
  `removeRole`, which keep whatever other roles the user holds. Reacting to the event itself would let
  a redelivered `subscription.active` hand the role back after the plan ended.

## End to end

`apps/web-e2e`'s `billing.spec` drives all of it against **Polar's sandbox**, whenever `.env.test`
(or `E2E_POLAR_ACCESS_TOKEN`) has a sandbox token: a free plan and a paid one are checked out in
Polar's hosted checkout, the subscription is cancelled in the customer portal, its end is asked of
Polar's API, and each webhook comes back through a tunnel to the web. It reads a token for itself and
never the root `.env`'s, and it refuses a `POLAR_ENVIRONMENT` other than `sandbox`. See
`apps/web-e2e/README.md`.

## Organizations

better-auth-ui shows billing in each organization's settings (`/organization/billing`), and its
Polar adapter buys and reads for the organization with `referenceId` — checked as above. A
subscription bought for an organization is still the buyer's, as a Polar customer: the
organization's id travels in its metadata. So its webhooks reach `SubscriptionAuthorship` as the
buyer's change, and the buyer is an `author` while it is active.

## Not done

- **Entitlements for an organization.** An organization's subscription grants the organization
  nothing yet; the role belongs to whoever paid.
- **Entitlements beyond the role.** A subscription grants `author`; no feature is gated by which plan.

## Tests

`pnpm nx test @nestposts/billing` — the mapping, the Markdown split, the cache, the configuration,
the account service against a fake client (who is subscribed, and a customer created once and only
when Polar has none), the webhook-to-change translation, the notification's key, subjects and template,
and both listeners inside a Nest module with a real `EventEmitterModule` — including that a listener
that throws fails the emit.
