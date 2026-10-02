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

## Who is calling: one `Identity`, however the question is asked

`Identity` (`domain/auth/vo/identity.ts`) is the caller, and every way of asking answers it. It is a
union, told apart by `kind` — the shape Quarkus gives its `SecurityIdentity`, over Better Auth:

- **`UserIdentity`** — a person: user id, email and name, through a cookie or through an OAuth access
  token a client was granted on their behalf.
- **`ClientIdentity`** — an OAuth client acting for itself, through a token of the client credentials
  grant: its client id, and no user.

What both answer needs no narrowing: `principal` (the user's id or the client's), `roles`, the `scopes`
its credential was granted, `activeOrganizationId` (a user's active organization; the one a client is
bound to), `credential` (`session`, or `access-token` with its `tokenId` and `expiresAt`) and
`attributes` — the credential's custom claims, the "extras" a token carries beyond what an identity
models. Each is read typed, through an `IdentityAttribute` declared once next to whoever reads it:

```ts
const AgentBotId = IdentityAttribute.of('agent_bot_id', z.coerce.number().int().positive());
identity.attribute(AgentBotId); // number | undefined — absent or invalid is undefined, never a failure
```

What only a person has — `userId`, `email`, `name` — needs `identity.kind === 'user'`, and the compiler
says where. `UserIdentity.required(identity)` is the caller as a user or the refusal that says why not:
`SessionNotAuthenticatedException` for nobody (`UNAUTHENTICATED`), `IdentityIsNotAUserException` for a
client (`FORBIDDEN`) — `@CurrentUser()`, `@CurrentAuthor()` and the organization service's
`requireActiveMember()` use it. Each kind is a `ValidatedDto` of its own with the shared behaviour mixed
in (`SecurityIdentity`): a top-level discriminated-union DTO substitutes its member's prototype, which
would lose any method a subclass of the union declared.

| | what it is | use it when |
|---|---|---|
| `@CurrentIdentity()` | a parameter decorator: the `Identity` the global guard found, `null` for nobody. Pipes compose on it — `@CurrentUser()` and `@CurrentAuthor()` are `CurrentIdentity(IdentityUserPipe…)`, and the organization decorators are the same | a resolver or a controller behind the global guard |
| `AuthService` | the **port** (`domain/auth/auth.service.ts`), request-scoped: `identity()`, `requireIdentity()`, the roles and the permissions of THIS request | application code that lives inside the request. It is the only one that does not name Better Auth |
| `IdentityResolver` | the **port** for who is calling, request-scoped like `AuthService`: `identity()` | a guard (`TenantMembershipGuard`), and code that holds a request instead of living inside one — the gateway's context function registers its `req` under a context id of its own and resolves it (`ContextIdFactory.create()`, `registerRequestByContextId`, `moduleRef.resolve`) |
| `@RequireScopes(...)` | a class or handler decorator: `ScopesGuard` refuses a credential not granted every scope listed, with a 403 (`FORBIDDEN`) — see **What a token may do is its scopes** | a handler an OAuth client should reach only with the user's consent |
| `BETTER_AUTH` | the **instance**, fully typed, with every plugin's endpoints on `auth.api` | you need an endpoint the ports do not wrap |
| `BetterAuthModule.forRoot` | the wiring itself: the instance, the ports, the tables | a composition root — `apps/posts-api`, and `apps/web`'s own Nest container |

**One lookup per request, and one translation per credential.** `BetterAuthIdentityResolver` answers a
request the global guard already authenticated from what the guard found, a request presenting no
credentials as nobody without asking, a token of the client credentials grant through `AccessTokens`,
and anything else with `getSession` — remembered by the instance, which belongs to one request, so the
guard, the tenant guard and `AuthService` asking about the same one cost what the guard cost.
`BetterAuthIdentityResolver.fromSession` is the one place Better Auth's session becomes a
`UserIdentity`, and `AccessTokens.clientIdentityOf` the one place a client's token becomes a
`ClientIdentity`; `BetterAuthService` delegates to the resolver.

**The global guard is `PlatformAuthGuard`**, installed by `AuthInfrastructureModule` in place of
`@thallesp/nestjs-better-auth`'s own (`disableGlobalAuthGuard`), which it extends: every caller with a
session goes through the library's guard untouched. A client's token is no session, so it is admitted
here, and only where a machine can be — on a handler that declares its scopes (`@RequireScopes`;
whether the client holds them is `ScopesGuard`'s), never on one that asks for a user or a member
(`@Roles`, `@OrgRoles`, `@UserHasPermission`, `@MemberHasPermission`), and with `@RequireActiveOrg` only
when it is bound to an organization. `@AllowAnonymous()` and `@OptionalAuth()` mean what they always
did. What it found is recorded on the request, so `@CurrentIdentity()` reads the client without asking
again, and `TenantMembershipGuard` (`@nestposts/organizations`) lets a client into its organization's
tenant and no other. The keys it checks are read off the library's own decorators, by applying each to
a probe — `OrgRoles` is `applyDecorators` and has no `KEY` to read.

**The request is read in one place too** (`infrastructure/request/`). `RequestHeaders.from(anything)`
turns every shape a transport calls "the request" into the `Headers` Better Auth takes: a Fastify or
Express request, a GraphQL context (`{ req }`), Yoga's `request` — whose headers are `@whatwg-node`'s
class, not the global one, and used to be read as an empty object — a Socket.IO client, and a message
with no headers at all, which yields an empty set rather than throwing. `RequestCredentials` is the
`cookie` and the `authorization` of one, for whoever needs the credentials without resolving them: the
gateway forwards them, the response cache keys by them (`RequestCredentials.keyOf`). `ExecutionRequest`
is the request an `ExecutionContext` is about, for the decorator and the guards.

**`AuthService` is request-scoped and takes no headers.** `Scope.REQUEST` + `@Inject(REQUEST)`, turned
into a `Headers` in the constructor. An instance belongs to one request, so `identity()` can only mean
that one's, and `IdentityResolver` is request-scoped the same way. The cost is Nest's scope bubbling:
whatever injects either becomes request-scoped too. A request-scoped **global** guard goes further: Nest
attaches it to every controller and every `@Resolver` (`addScopedEnhancersMetadata`), so
`TenantMembershipGuard`, an `APP_GUARD` that injects the resolver, makes every entry point of posts-api
and the notificator request-scoped — measured on posts-api, from 1 of 16 to all 16. That was accepted:
an instance of each per request is cheap next to one `getSession`, and what is remembered per request
lives in Nest's own request scope instead of a `WeakMap` keyed by the request.

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

## The tables: the user mapped by hand, the rest generated

Better Auth describes its own schema (`getAuthTables`). `schema.ts` turns that description into
MikroORM `EntitySchema`s, which is drift-free and is how every table used to be mapped.

The user is mapped by hand instead, and so are the three tables `@nestposts/organizations` owns.
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

**A user is one row, and `AuthUser` is a kind of `User`.** Better Auth's user model is `authUser`, so
the adapter looks it up as the class `AuthUser` — and `AuthUser extends User`, the aggregate
`@nestposts/users` owns. `User` is mapped by that package on `public.users`, and `AuthUser` adds only
what Better Auth keeps about a credential (`emailVerified`, `image`, the bans, `twoFactorEnabled`) as a
**single-table inheritance** child of it. There is no second table and no profile per tenant: the row
a sign-up writes is the `User` every module reads, in every tenant. What a tenant still keeps of its
own is the `authors` row that makes that user an `Author` there — see `UserProvisioning` in
`apps/posts-api`.

- **The roles are Better Auth's.** `role` is the admin plugin's comma-separated column, mapped on
  `User` so the domain can read it (`user.roles`, `user.hasRole`); nothing in the domain writes it.
  It changes through Better Auth — the admin screens, or `IdentityProvider.addRole`/`removeRole`,
  which go through the internal adapter so its hooks and its session cache see the change.
- **The `User` mapping is abstract, and that is not taste.** MikroORM 7 joins a relation that targets
  an STI entity with `kind = <that entity's discriminator value>` — the value alone, not its
  subclasses — so with a concrete `User` every join to it (the `active` filter's auto-join included)
  would have dropped each row written as an `AuthUser`: an event with no responsible, a post with no
  author. An abstract root has no value of its own, so nothing is added. Every row is of the one
  concrete kind, and `kind` defaults to it in the database, so a `User` the domain persists by itself
  (a spec's fixture) is the same row a sign-up writes.
- **The child names its schema.** An STI child inherits its root's table name and NOT its schema, so
  without `schema: SYSTEM_SCHEMA` on `AuthUser` Better Auth read `tenant_root.users` in any tenant's
  entity manager — and every spec passed, because a spec rewrites every table onto its own schema.
- **Deleting an account is a soft delete.** `User` is soft-deletable, and the adapter deletes through
  `em.remove`, which `SoftDeleteSubscriber` turns into `deleted_at` — so what the user wrote keeps its
  author. The row then leaves every query through the `active` filter, Better Auth's included, and
  the address is free again: the email is unique only among the rows that are not deleted. The
  adapter loads the row with its id alone before removing it, which is why `WithSoftDelete` replaces
  the embeddable instead of writing into one that a partial load left undefined.

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
| `admin` | roles on `users.role`, bans, impersonation — what `@Roles([...])` reads | — |
| `jwt` | the JWKS the OAuth tokens are signed with (ES256), under one `issuer` (`AUTH_ISSUER`) for every instance | — |
| `@better-auth/oauth-provider` | this system as an OAuth 2.1 / OIDC provider: authorize, consent, token, userinfo. Only a system `admin` creates, edits or deletes clients (`clientPrivileges`) | — |
| `openAPI` | the reference at `/api/auth/reference` | — |
| `magicLink` | sign-in by a link, token stored hashed | `auth.MagicLink` |
| `emailOTP` | sign-in by a code, stored hashed | `auth.OneTimePassword` |
| `twoFactor` | TOTP, backup codes, and an emailed code as the second step | `auth.OneTimePassword` (`two-factor`) |
| `multiSession` | several accounts in one browser | — |
| `oauth-bearer-session` (ours) | an OAuth access token issued for a resource of this system answers `getSession` as its user — see below | — |

and, in the core options: email verification (**required to sign in** unless
`AUTH_REQUIRE_EMAIL_VERIFICATION=false`), password reset, email change and account deletion, each of
which sends an email.

The screens for all of them are better-auth-ui's, copied into `apps/web` from its shadcn registry.
`loginPage`, `consentPage`, `signup.page` and `selectAccount.page` of the OAuth provider point at
those screens (`/auth/sign-in`, `/auth/oauth-consent`, …), on `WEB_URL`.

## The avatar is an attachment

Better Auth's `image` is a string, and the row keeps an `Attachment` of `@nestposts/asset` —
`attachment({ disk: 'public', folder: 'avatars', preComputeUrl: true })` on `AuthUser`, a `json`
column. The two meet in two places, and nowhere else:

- **Writing, in the user's database hooks** — `UserDatabaseHooks`, so every path that writes a user
  goes through them, whatever endpoint it is. `AvatarImages` makes the attachment with
  `Attachment`'s own static constructors:

  | `image` written | what the row keeps |
  |---|---|
  | `undefined` | nothing changes — a name-only `update-user` keeps the avatar |
  | `null`, `''` | no avatar; the flush deletes the one there was |
  | what `generatePresignedUrl` staged, as JSON — `{ name, size, extname, mimeType }` | `UploadArea.stage`, i.e. `Attachment.fromDisk` — the user's own `tmp/<id>/` on `update-user`, `tmp/anonymous/` on a sign-up |
  | a URL, on a social sign-in (`/callback/:id`, `/sign-in/social`) | `Attachment.fromUrl`: the provider's picture, downloaded and stored as ours |
  | anything else, an image type other than png, jpeg, webp, gif or avif included | refused, `400 AVATAR_NOT_UPLOADED` |

  A provider's picture that cannot be downloaded, or is not an image, leaves the user without one and
  never fails the sign-in.
- **Reading, in the column's serializer** — the adapter reads a row back through MikroORM's
  `serialize()`, and the property's `serializer` answers the attachment's URL. Better Auth, the
  session, the cookie cache and the browser only ever see a string.

The attachment subscriber does the rest, as for any column: it moves the staged object into
`avatars/` when the row is flushed, and deletes the avatar a new one replaces or a `null` clears.

**Only a process with `AttachmentModule` takes an avatar** — posts-api and the web. `AvatarImages`
injects `AttachmentManager` as optional; without one (the notificator, the migrator) an upload is
refused with `501 AVATARS_NOT_STORED` and a provider's picture is dropped, instead of writing a
pending attachment nothing would ever store.

## Database hooks are `@DatabaseHook` providers

What happens to a row before or after Better Auth writes it is a provider of the module that owns the
concern, decorated with `@thallesp/nestjs-better-auth`'s `@DatabaseHook()` and `@BeforeCreate`,
`@AfterUpdate`, … — `UserDatabaseHooks` here (a user is born with a name; its `image` is an
attachment), `UserProvisioningHooks` in posts-api. That library's `AuthModule` finds them when the
application starts and attaches them to the instance's `databaseHooks`, which is why
`BetterAuthInstance` passes an empty `databaseHooks: {}`: the library refuses to start without one.

- **Every process installs that `AuthModule`**, through `AuthInfrastructureModule` — the web's
  container and the migrator with `routes: false, guard: false` — or a hook would run in one process
  and not in another. Locally the sign-up, the profile and the Google callback are served by the web.
- **One provider per model, operation and moment.** The library attaches a second one by awaiting
  the first and answering with the second's result alone, each given the original data: a
  `@BeforeCreate('user')` elsewhere would silently drop `UserDatabaseHooks`'s answer — and with it
  the name a magic-link sign-up needs. A new concern for the same moment goes into the provider that
  already holds it. `after` hooks answer nothing, so any number of them compose.

## A user's OAuth access token is a session

A client that went through the consent screen holds an access token, and the services behind the
gateway accept it where they accept a cookie. `plugins/oauth-bearer-session-better-auth.plugin.ts` is
a `before` hook on `/get-session`: `Authorization: Bearer <JWT>` addressed to one of
`oauthResources` and signed by this deployment's `issuer` answers as the user it was issued for —
so the global guard, `@CurrentIdentity()`, `IdentityResolver` and `AuthService` see it without knowing a token was involved.

- **Verified locally.** `verifyJWT` reads the keys the jwt plugin keeps in the database every process
  shares: no call to the issuer, no JWKS fetch, nothing that a cold identity provider can stall.
- **A JWT only when asked for a resource.** The client names the gateway as the `resource` (RFC 8707)
  on authorize and on token; without it the provider issues an opaque token that only `userinfo`
  understands. Anything that is not a signed token falls through to Better Auth's own lookup.
- **The user is read, not trusted.** The token carries only `sub`; the row is loaded, and a user who
  no longer exists — or is banned — gets no session.
- **Its custom claims travel.** Whatever the issuer added beyond the registered claims is put on the
  session as `claims`, and the `UserIdentity` keeps it as its `attributes`; the token's `jti` and expiry
  are its `credential`.
- **A client's own token is left alone.** A token of the client credentials grant (`sub` =
  `client_id`) is no user's: the hook returns before verifying it, and `AccessTokens` reads it instead.
- **One issuer for every instance.** `posts-api`, `apps/web`, the notificator and the migrator each
  hold a Better Auth instance with a base URL of their own, and the jwt plugin would sign with that
  URL as `iss`. `AUTH_ISSUER` (default `WEB_URL`) makes it one value, so a token issued by the web
  verifies in a subgraph.

**The resources are rows, seeded by the migrator — not configuration.** `oauthProvider({ resources })`
seeds its `oauth_resource` table in the plugin's `init`, which Better Auth runs as the instance is
constructed: outside any MikroORM request context (`Using global EntityManager…`), and in every
process — the web and the notificator included — that would then need the database at boot, with a
failure rejecting the whole `$context`. `apps/migrator`'s `OAuthResourcesSeeder` registers
`oauthResources` instead, from the same configuration, in `setup` and in the deployment seed.

**Any registered client may ask for any enabled resource** (`enforcePerClientResources: false`). The
provider's default is to require each client to be linked to each resource first (RFC 8707 §3), and
linking new clients automatically (`clientRegistrationDefaultResources`) needs the resources in the
plugin's configuration — which is the boot-time seeding above. Here only a system `admin` registers a
client (`clientPrivileges`), there is one resource — the gateway — and what a token may do is decided
by its scopes, so the linkage would restrict nothing that is not already restricted.

**A refusal is a 403, and `oauthClientPrivileges` throws it itself.** Returning `false` leaves the
answer to the plugin, which throws a message-less `UNAUTHORIZED` — a 401 — and better-auth-ui maps
every 401 to "Please sign in again to continue". A signed-in non-admin creating a client got exactly
that, on AWS, with a valid session. It now answers `403 OAUTH_CLIENT_ADMIN_REQUIRED` with
"Only an admin can create an OAuth client", which the UI shows as a permission error. Nothing seeds an
`admin`: the deployed stages have one only when somebody sets `users.role` by hand, the way
`apps/web-e2e` does for its own.

### Discovery, at the issuer's root

`AuthInfrastructureModule` with its routes on also serves `/.well-known/oauth-authorization-server`
and `/.well-known/openid-configuration` at the root (`OAuthDiscoveryController`): the oauth provider
plugin's own documents (`auth.api.getOAuthServerConfig`/`getOpenIdConfig`), which its handler answers
only for a request that reaches it — under `/api/auth`. A resource server (an MCP server, an AgentCore
JWT authorizer) finds the JWKS there, and checks that the `issuer` inside equals the origin it asked:
so the origin that answers is the issuer's — the router on AWS, which sends both paths to the gateway,
and `apps/web` locally, whose routes hand the request to the same handler.

## A client's own access token is a `ClientIdentity`

A client that authenticates as itself — the client credentials grant, a machine with no user behind
it, the Chatwoot agent bots — holds a token whose subject is the client. `AccessTokens`
(`infrastructure/better-auth/identity/access-tokens.ts`) reads it:

- **Verified locally, as an access token.** `jose` against the keys the jwt plugin keeps
  (`auth.api.getJwks()`, the same rows `verifyJWT` reads — which cannot be called here, it needs a Better
  Auth endpoint's context), for `issuer` and `oauthResources`, with `typ` `at+jwt`, so an ID token or a
  session JWT signed with the same keys is refused, and with `sub`, `jti` and `exp` required.
- **Bound to the organization it was registered for.** The provider's claim extension
  (`OAuthClientClaims.forAccessToken`) writes the client's `referenceId` as `organization_id` into every
  token of the client credentials grant — last, so nothing a client declares overrides it — and that is
  the identity's `activeOrganizationId`. A client registered for none is bound to none.
- **What the client declares travels.** A client whose `metadata` holds a `claims` object gets those
  claims in every token (`OAuthClientClaims.of`), and they are the identity's `attributes` — the
  Chatwoot agent bot's `agent_bot_id` is one.

Which way a bearer is read is decided without verifying it (`AccessTokens.isIssuedToAClient`: `sub` =
`client_id`), and whatever is read is verified — once.

### What a token may do is its scopes

`Identity.scopes` is what the credential may be used for, and there are three kinds of credential:

- **A cookie is this system's own.** Whoever holds one signed in through its screens and is using the
  system itself, so the identity holds **every** scope — `OAUTH_SCOPES` (`domain/auth/scopes.ts`, which
  is also the list the provider offers) — and only roles restrict it.
- **An access token is a client acting for the user**, and holds what the user allowed it on the
  consent screen: `oauth-bearer-session` puts the JWT's `scope` claim on the session it answers
  (`session.scopes`), and `BetterAuthIdentityResolver.fromSession` keeps it. A token that names no scope
  holds none — a session with no `scopes` at all is what marks the cookie, so a token can never fall
  into "everything".
- **A client's own token** holds the scopes of its `client_credentials_scopes` it asked for, and
  nothing else — a client is never a cookie.

`@RequireScopes('write:posts')` on a handler or a class (the two add up) is where a scope is enforced:
`ScopesGuard` asks the `IdentityResolver` and refuses with a 403 — `FORBIDDEN` in GraphQL, naming the
scopes required — a caller whose credential lacks one. **Nobody passes**: a scope narrows what a
credential may do, and whether a handler needs a credential at all is the global guard's
(`@AllowAnonymous()`). posts-api requires `read:posts` on the post queries and subscriptions and
`write:posts` on the post mutations; its e2e signs tokens with each and calls them. The guard is
declared `Scope.REQUEST`, and that is not decoration: left to scope bubbling, the posts-api resolvers
were handed an instance whose constructor never ran, and every guarded operation failed.

## Sessions in Redis, in front of the database

When the application declares a `RedisModule` (`@nestposts/redis`), `BetterAuthModule` gives the
instance a secondary storage on it — `storage/redis-secondary-storage.ts`, Better Auth's own node-redis
implementation, every key under `better-auth:` — through an optional provider
(`BETTER_AUTH_SECONDARY_STORAGE`), the same shape the organization plugin has for tenancy. Without one
there is no storage and nothing changes. With one:

- **Postgres stays the source of truth.** `session.storeSessionInDatabase` is on: a session is written
  to both, read from Redis first and from its row on a miss — which is what keeps a session issued
  before Redis existed valid, and a row everything else reads (the admin screens, the migrator) there.
  A cookie session then costs no query at all: the storage keeps the user beside the session.
- **`verification.storeInDatabase` is not optional.** Magic link and email OTP reserve a verification
  value when an unverified account is claimed, and Better Auth throws
  `reserveVerificationValue requires database-backed verification storage` for one that lives only in
  the storage — the sign-in fails. `redis-secondary-storage.spec.ts` turns the option off and watches
  exactly that error.
- **Listing a user's sessions reads Redis only**, even with the rows in the database. A session
  Better Auth never wrote to Redis is not listed, though it still authenticates.
- **Every process that holds Better Auth shares the Redis**, like `AUTH_SECRET`. A process without it
  revokes a session in Postgres alone, and the others keep answering it from Redis until it expires.
- **A write around Better Auth leaves the copy stale.** `internalAdapter.updateUser` — which
  `BetterAuthIdentityProvider` and the admin plugin use — refreshes the copy of every live session of
  the user; an `update users set role = …` by hand does not, and the user keeps the old role until they
  sign in again. `apps/web-e2e`'s `SessionCache` rewrites the copies after its own SQL.
- **`clear()` forgets everything under the prefix** — the migrator's `db:fresh` calls it after dropping
  the tables, or every session it issued would still answer, for users that no longer exist.
- **Rate limiting moves to the storage** (Better Auth's default once there is one), counted with
  `INCR` and `EXPIRE … NX`: Redis 7.

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
which is what `@Roles([AUTHOR_ROLE])` reads off `users.role`.


## Configuration

The library owns it, and an application loads nothing. `src/config/auth-env.schema.ts` is the
variables below as a Zod object — Zod and literals only, which is what lets `apps/web/src/env.mjs`
spread it into its t3 env — and `src/config/auth.config.ts` is `authConfig`, the `registerAs('auth')`
that parses `process.env` with it; `AuthConfig` is `ConfigType<typeof authConfig>`, and there is no
other type. `BetterAuthModule` registers it with `ConfigModule.forFeature` and exports it, so every
plugin provider — the organization module's included — injects `authConfig.KEY`. Before a container
exists, call it: `authConfig()` is what `BetterAuthEntities` generates the tables with, and what the
web's sign-in screen asks which social providers there are. A spec that needs another value spreads
it, `{ ...authConfig(), rateLimit: false }`.

| | |
|---|---|
| `AUTH_URL` | the origin Better Auth answers on (default `http://localhost:${PORT}`) |
| `AUTH_SECRET` | signs the session cookie. **Every process that reads a session needs the same one** |
| `AUTH_BASE_PATH` | default `/api/auth` |
| `WEB_URL` | where the login/consent screens live, and a trusted origin by default |
| `AUTH_TRUSTED_ORIGINS` | replaces that default, comma-separated |
| `AUTH_COOKIE_DOMAIN` | the cross-subdomain cookie domain, applied only on a real deployment |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`, `AUTH_GITHUB_*` | a provider is configured or it is absent (`google`/`github`, or `null`): a pair half-filled or declared empty is none. Google asks which account (`prompt: select_account`); its client's redirect URI is `<AUTH_URL or WEB_URL>/api/auth/callback/google` — the web's locally, the router's on AWS |
| `AUTH_REQUIRE_EMAIL_VERIFICATION` | `false` lets an unverified address sign in; the verification email is sent either way |
| `AUTH_RATE_LIMIT` | `false` turns Better Auth's rate limiter off. It is on in production by default, and a browser suite signing dozens of people up from one address is exactly what it refuses |
| `AUTH_ISSUER` | the `iss` every access token is signed with and verified against (default `WEB_URL`) |
| `GATEWAY_URL` | the gateway as an OAuth resource — the audience a bearer JWT must carry (default `http://localhost:4000/graphql`) |
| `AUTH_OAUTH_RESOURCES` | replaces that single resource, comma-separated |

`AuthInfrastructureModule.forRoot({ routes: false })` keeps the global guard and does not serve
`/api/auth/*` — what a subgraph behind the gateway wants: it authenticates every caller and signs
nobody in. `guard: false` as well is a runtime that is no Nest server — the web's container, the
migrator: no routes, no guard, and the `@Hook`/`@DatabaseHook` providers attached all the same.

`authConfig` decides `Secure` and `Domain` from **the URL and `NODE_ENV` together**, not from
`NODE_ENV` alone: a production build served on `localhost` would otherwise issue
`Secure; Domain=…` cookies the browser drops, and every login would succeed and bounce straight back
to the sign-in page.

## Outside a Nest server: a Nest container

There is no standalone builder. A runtime that is not a Nest **server** — `apps/web`, a script, a
seeder — boots a Nest **container** instead and imports these same modules:

```ts
const context = await NestFactory.createApplicationContext(SomeModule);
const auth = await context.resolve(AuthService, contextId);
const identity = await auth.identity();
```

One wiring rather than two, which matters more than it sounds: the ports are `Scope.REQUEST`, so a
second assembly would have to reproduce how a request reaches them, and would drift.
`registerRequestByContextId` hands over the incoming headers, and what comes back is exactly the
service a resolver injects on the other side. `apps/web/src/nest/` is the worked example; the root
`CLAUDE.md` has the rest of that story.

Such a container imports `AuthInfrastructureModule.forRoot({ routes: false, guard: false })`: the
`/api/auth/*` catch-all and the global guard need an HTTP adapter a container does not have — it
serves those routes itself — and what the module does besides, attaching the database hooks, it
needs like any other process.

Two things it has to take care of, because there is no request pipeline to do them:
`inRequestContext` around each call, since `allowGlobalContext` is off and the alternative is one
identity map shared by every request the server ever answers; and a cookie plugin — `nextCookies()` —
registered through `trailingPlugins`, because Better Auth requires cookie plugins last.
