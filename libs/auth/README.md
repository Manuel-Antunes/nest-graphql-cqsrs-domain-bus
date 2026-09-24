# `@nestposts/auth`

Authentication: the Better Auth server instance, the tables it owns, and the ports the rest of the
repository talks to it through.

Organizations are **not** here — they are `@nestposts/organizations`, which is built on this package
and contributes its plugin to the instance this one builds. Nothing in here names an organization,
which is what lets a service authenticate without having one.

It is a **domain module** in this repository's sense — `domain/` and `infrastructure/`, no application
layer (see the root `CLAUDE.md`). Which command exists and which resolver answers is
`apps/posts-api`'s business; what an organization *is*, and where a session comes from, is this
package's.

## The three ways in, and when each is right

| | what it is | use it when |
|---|---|---|
| `AuthService` | the **port** (`domain/auth/auth.service.ts`) — the session, the roles and the permissions of THIS request, in this repository's value objects | application code. It is the only one that does not name Better Auth |
| `BETTER_AUTH` | the **instance**, fully typed, with every plugin's endpoints on `auth.api` | you need an endpoint the port does not wrap |
| `BetterAuthModule.forRoot` | the wiring itself: the instance, the ports, the tables | a composition root — `apps/posts-api`, and `apps/web`'s own Nest container |

`BetterAuthService` implements the port over the instance, so the three are one object's worth of
behaviour and never diverge.

**The port is request-scoped and takes no headers.** `Scope.REQUEST` + `@Inject(REQUEST)`, turned
into a `Headers` in the constructor by `headersFrom` — which absorbs the three shapes `REQUEST`
actually has (the Express request, the GraphQL context, a microservice message with no headers at
all, which yields an empty set rather than throwing). An instance belongs to one request, so
`session()` can only mean that one's. The cost is Nest's scope bubbling: whatever injects it becomes
request-scoped too.

## Why the plugin registry is a tuple of providers

`plugins/registry.ts` declares `coreBetterAuthPluginProviders` `as const`. That array is, at once:

- the **DI registration** — one Nest provider per plugin, each with its own token, because Nest has no
  multi-provider support and two providers sharing a token silently overwrite each other;
- the **runtime order** — `BetterAuthPluginsFactory` injects them in order and Nest resolves `inject`
  positionally, so the array the factory returns lines up 1:1 with the declaration;
- the **compile-time tuple** — `BetterAuthPlugins` maps over it to recover each plugin's exact type,
  which is what gives `betterAuth()` its inference and therefore what puts `setActiveOrganization`,
  `hasPermission` and `generateOpenAPISchema` on `auth.api` at all.

Lose the tuple and nothing breaks loudly: `auth.api` quietly narrows to the plugin-less surface and
every call through it stops type-checking. `plugin-registry.spec.ts` asserts the endpoints exist for
exactly that reason.

**`@better-auth/oauth-provider` is cast to `typeof plugin & BetterAuthPlugin`.** Its `init()` returns
a shape the `BetterAuthPlugin` constraint does not accept, and without the intersection the whole
tuple fails the constraint — which is how the inference collapses. The intersection keeps the
plugin's own endpoints while satisfying the constraint, and it is the one cast in the registry.

`buildBetterAuthPlugins` instantiates the same providers **outside** Nest by resolving their `inject`
tokens against a small map. That is what lets `apps/web` share this registry instead of keeping a
second plugin list in step with it, and it throws — rather than skipping — for a token it does not
know.

**The registry is a core, not a closed list.** `betterAuthPluginProviders(extra)` puts a contributed
module's providers BEFORE the core ones, and `BetterAuthWith<TExtra>` is the instance type that
follows. That is the seam `@nestposts/organizations` comes through, and the reason this package never
has to name it.

**`BetterAuthModule.forRoot` is global.** There is exactly one Better Auth instance per process, and
everything that authenticates needs it. Registering it twice would build a SECOND one — a second set
of plugins, a second JWKS, and sessions one half issues that the other rejects.

## The tables: the credential mapped by hand, the rest generated

Better Auth describes its own schema (`getAuthTables`). `schema.ts` turns that description into
MikroORM `EntitySchema`s, which is drift-free and is how every table used to be mapped.

`auth_user` is mapped by hand instead, and so are the three tables `@nestposts/organizations` owns.
They follow the same rules as `Post` and `User`: a domain class with value-object properties and
`Ref` relations in `domain/`, and a `defineEntity` mapping in
`infrastructure/persistence/entities/`. `betterAuthEntities({ mapped })` skips whatever a module says
it maps itself, so each table is mapped exactly once.

**The plugins are an input to the entity list**, not a detail of it: `session` grows an
`active_organization_id` the moment the organization plugin is on. A caller that generates the list
without the plugins it actually runs gets a schema quietly missing a column — which is why
`authWithOrganizationEntities()` is the single composition point for a system that has organizations.

Better Auth finds them because it looks a model up by name:
`naming.getEntityName(naming.classToTableName('organization'))` is `Organization`, which is our class.
It writes `organizationId` and `userId`; the adapter resolves those against the `manyToOne` join
columns, so `Member.organization` is a `Ref<Organization>` on our side and an id on the wire.
`better-auth-mapping.spec.ts` drives that round trip against a real schema — including that a row
Better Auth wrote comes back with `Email` and `OrganizationSlug` instances on it.

**The user model is `authUser` on purpose.** Left as `user` it would map to a class named `User`,
which `@nestposts/users` already owns. `auth_user` is the credential; `users` is the profile; they are
joined by email, by `UserProvisioning` in `apps/posts-api`.

**A Better Auth array is a TEXT column.** The adapter does not declare array support, so Better Auth
writes a `string[]` field — the OAuth client's `redirectUris`, its `scopes` — as a JSON string and
parses it back on read. Mapped as a Postgres array, the first client registration failed with
`Could not convert JS value '["openid",…]' of type 'string' to type ArrayType`. `schema.ts` maps
those fields to `text`, and so does everything whose name matches `LONG_TEXT` (the two-factor backup
codes, encrypted, are longer than a `varchar(255)`).

**No schema is created here.** DDL is `apps/migrator`'s, and a mapping added here means a migration
there.

## The plugins, and what each one is for

| plugin | what it gives | its emails |
|---|---|---|
| `admin` | roles on `auth_user`, bans, impersonation — what `@Roles([...])` reads | — |
| `jwt` | the JWKS the OAuth tokens are signed with (ES256) | — |
| `@better-auth/oauth-provider` | this system as an OAuth 2.1 / OIDC provider: authorize, consent, token, userinfo. Only a system `admin` creates, edits or deletes clients (`clientPrivileges`) | — |
| `openAPI` | the reference at `/api/auth/reference` | — |
| `magicLink` | sign-in by a link, token stored hashed | `auth.MagicLink` |
| `emailOTP` | sign-in by a code, stored hashed | `auth.OneTimePassword` |
| `twoFactor` | TOTP, backup codes, and an emailed code as the second step | `auth.OneTimePassword` (`two-factor`) |
| `multiSession` | several accounts in one browser | — |

and, in the core options: email verification (**required to sign in** unless
`AUTH_REQUIRE_EMAIL_VERIFICATION=false`), password reset, email change and account deletion, each of
which sends an email.

The screens for all of them are better-auth-ui's, copied into `apps/web` from its shadcn registry.
`loginPage`, `consentPage`, `signup.page` and `selectAccount.page` of the OAuth provider point at
those screens (`/auth/sign-in`, `/auth/oauth-consent`, …), on `WEB_URL`.

## Every email is a notification

Better Auth asks for an email through a callback — `sendResetPassword`, `sendMagicLink`,
`sendVerificationOTP`. `BetterAuthEmails` is the object those callbacks are, and each of its methods
builds a domain notification (`domain/auth/notification/`) and sends it through
`OnDemandNotifications` (`@nestposts/notifications`), addressed by the email alone:

```ts
sendResetPassword: ({ user, url }) => emails.resetPassword({ user, url }),
```

By the address alone because most of these are about somebody who is not a user yet — a sign-up
being verified, a magic link to an address never seen. Each notification goes through `email` only,
never `database`: there is no identity to keep a record against, and what it carries is a secret.

What sends them is an option of the module: `PublishingOnDemandNotifications` hands them to the
transport, and `apps/notificator` renders and delivers them — that is what `apps/posts-api` and
`apps/web` bind. The default, `LoggingOnDemandNotifications`, sends nothing and says so, which is right
for the migrator, whose seeders sign users up through Better Auth.

```ts
BetterAuthModule.forRoot({ ..., notifications: PublishingOnDemandNotifications })
```

| notification | sent when | template |
|---|---|---|
| `auth.EmailVerification` | sign-up, and an unverified sign-in | better-auth-ui `EmailVerificationEmail` |
| `auth.PasswordReset` | a reset is requested | `ResetPasswordEmail` |
| `auth.MagicLink` | a magic link is requested | `MagicLinkEmail` |
| `auth.OneTimePassword` | a code is requested — `sign-in`, `email-verification`, `forget-password`, `change-email`, or the `two-factor` step | `OtpEmail`, worded for the purpose |
| `auth.EmailChange` | a change of address, confirmed at the CURRENT address | `ChangeEmailConfirmationEmail` |
| `auth.AccountDeletion` | a deletion, confirmed before anything is removed | `DeleteAccountVerificationEmail` |

`authNotifications` is the list, for the process that delivers them to register. The templates are
the React Email components of better-auth-ui, copied here — `NOTICE.md` says what, from where, and why
they are copied rather than imported.

## Organizations

Gone to `@nestposts/organizations`, along with the `organization` plugin provider, the organization
access control, the invitation email and the tenant-schema trigger. What stayed here is the *system*
access control in `access.ts` — the roles the `admin` plugin checks (`admin`, `author`, `user`),
which is what `@Roles([AUTHOR_ROLE])` reads off `auth_user.role`.


## Configuration

`config.ts`, from the environment, validated by Zod.

| | |
|---|---|
| `AUTH_URL` | the origin Better Auth answers on (default `http://localhost:${PORT}`) |
| `AUTH_SECRET` | signs the session cookie. **Every process that reads a session needs the same one** |
| `AUTH_BASE_PATH` | default `/api/auth` |
| `WEB_URL` | where the login/consent screens live, and a trusted origin by default |
| `AUTH_TRUSTED_ORIGINS` | replaces that default, comma-separated |
| `AUTH_COOKIE_DOMAIN` | the cross-subdomain cookie domain, applied only on a real deployment |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`, `AUTH_GITHUB_*` | a provider is configured or it is absent |
| `AUTH_REQUIRE_EMAIL_VERIFICATION` | `false` lets an unverified address sign in; the verification email is sent either way |
| `AUTH_RATE_LIMIT` | `false` turns Better Auth's rate limiter off. It is on in production by default, and a browser suite signing dozens of people up from one address is exactly what it refuses |

`cookieSecurity` decides `Secure` and `Domain` from **the URL and `NODE_ENV` together**, not from
`NODE_ENV` alone: a production build served on `localhost` would otherwise issue
`Secure; Domain=…` cookies the browser drops, and every login would succeed and bounce straight back
to the sign-in page.

## Outside a Nest server: a Nest container

There is no standalone builder. A runtime that is not a Nest **server** — `apps/web`, a script, a
seeder — boots a Nest **container** instead and imports these same modules:

```ts
const context = await NestFactory.createApplicationContext(SomeModule);
const auth = await context.resolve(AuthService, contextId);
```

One wiring rather than two, which matters more than it sounds: the ports are `Scope.REQUEST`, so a
second assembly would have to reproduce how a request reaches them, and would drift.
`registerRequestByContextId` hands over the incoming headers, and what comes back is exactly the
service a resolver injects on the other side. `apps/web/src/nest/` is the worked example; the root
`CLAUDE.md` has the rest of that story.

Such a container imports `BetterAuthModule` and **not** `AuthInfrastructureModule`: the second
installs the `/api/auth/*` catch-all and the global guard through `@thallesp/nestjs-better-auth`,
which needs an HTTP adapter a container does not have. It serves those routes itself.

Two things it has to take care of, because there is no request pipeline to do them:
`inRequestContext` around each call, since `allowGlobalContext` is off and the alternative is one
identity map shared by every request the server ever answers; and a cookie plugin — `nextCookies()` —
registered through `trailingPlugins`, because Better Auth requires cookie plugins last.
