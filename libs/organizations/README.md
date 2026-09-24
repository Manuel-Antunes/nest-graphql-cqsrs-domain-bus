# `@nestposts/organizations`

Organizations, members and invitations: the three tables Better Auth's `organization` plugin owns,
given this repository's shape, and the service that answers what the caller may do inside one.

It is built **on** `@nestposts/auth` and the dependency only runs that way. Authentication does not
know organizations exist — that is what lets a service authenticate without one.

## What is here, and what stayed in `@nestposts/auth`

| | `@nestposts/auth` | this package |
|---|---|---|
| the instance | builds it (`BETTER_AUTH`), with the CORE plugins | contributes the `organization` plugin to it |
| tables | `auth_user`, and everything Better Auth generates | `organization`, `member`, `invitation` |
| the question | *who is this?* — `AuthService` | *what may they do in which organization?* — `OrganizationService` |
| access control | the system roles (`admin`, `author`, `user`) | the organization roles (`owner`, `admin`, `member`) |

`Member.user` is a `Ref<AuthUser>` and `Member.organization` a `Ref<Organization>` — the relation
that crosses the package boundary is a real foreign key, mapped the same way `Post.author` is.

## The plugin is contributed, not imported

`@nestposts/auth` registers a **core** registry and takes more:

```ts
AuthInfrastructureModule.forRoot({
  plugins: organizationAuthPluginProviders,
  entities: authWithOrganizationEntities(),
  imports: [OrganizationsInfrastructureModule],
})
```

That is the whole seam, and it is the reason the dependency points one way. Contributed providers are
registered **before** the core ones: `@better-auth/oauth-provider` resolves the jwt plugin from
context, and Better Auth wants cookie plugins last.

**The plugin list decides the tables, so it decides the entity list too.** `session` grows an
`active_organization_id` the moment this plugin is on — which is why `authWithOrganizationEntities()`
exists and why it is the ONE place `apps/migrator`, the standalone runtime and the Nest modules all
read from. Generating that list without the plugins you actually run gives you a schema quietly
missing a column.

## The services take the request, not headers

`AuthService` and `OrganizationService` are `Scope.REQUEST`. They receive Nest's `REQUEST` in the
constructor and turn it into a `Headers` there, once:

```ts
const member = await this.organizations.requireActiveMember();
```

rather than `requireActiveMember(headers)`. An instance belongs to one request, so "the active
organization" can only mean that request's — passing the wrong headers stops being a thing that can
be typed. `headersFrom` (in `@nestposts/auth`) is what absorbs the three shapes `REQUEST` actually
has: the Express request over HTTP, the GraphQL context inside a resolver, and a message on a
microservice — which has no headers at all and yields an empty set rather than throwing, because a
message legitimately carries no session.

The cost is Nest's scope bubbling: whatever injects these becomes request-scoped too. That is why the
pipes are, and why nothing in a saga or an event handler injects them — those have a `PostRequest`,
not an HTTP one.

## An invitation is a notification

The plugin's `sendInvitationEmail` builds an `OrganizationInvitationNotification`
(`organizations.Invitation`) and sends it through `OnDemandNotifications` to the invited address — the
same path every authentication email takes (`libs/auth/README.md`), so it is delivered by
`apps/notificator` and rendered from better-auth-ui's `OrganizationInvitationEmail`, copied here with
its own `email-styles` (see `libs/auth/NOTICE.md`).

The link is `WEB_URL/auth/accept-invitation?invitationId=…`, better-auth-ui's accept view, which signs
the invitee in first and brings them back. It has no `key`, deliberately: resending an invitation is
the same invitation id, and a keyed notification would be the same notification — which the
notificator's delivery ledger would skip as already sent.

## Teams

`teams: { enabled: true }`. Better Auth then owns two more tables, `team` and `team_member`, and a
column on each of `session` (`active_team_id`) and `invitation` (`team_id`). The first two are
generated like every other Better Auth table; `invitation` is mapped here, so `teamId` is on
`Invitation`. better-auth-ui's organization screens show the teams tab, the team switcher and the team
picker in the invite dialog.

## `OrganizationNotSelected` and `ActiveMemberNotFound` are different failures

The first says the session has not picked an organization; the second says the caller picked one they
do not belong to. `requireActiveMember()` throws them apart on purpose and
`AuthExceptionFilter` gives them different codes — one is a prompt, the other a refusal.

## An organization is a tenant

A tenant's rows live in a schema of its own, `tenant_<slug>` — see `libs/database/README.md` for the
entity manager that routes there, and the root `CLAUDE.md` for the whole path. This library owns the
three things that make an organization one:

- **The schema is created with the row.** `Organization` carries a MikroORM `trigger` that creates
  `tenant_<slug>` on insert and drops it `cascade` on delete, emitted into a system migration like any
  other DDL. It quotes with `%I`: a slug may contain a dash, and `tenant_acme-corp` is not a valid
  unquoted identifier.
- **The schema is migrated when the organization is created.** The plugin's
  `organizationHooks.afterCreateOrganization` calls `TenantEntityManagerService.provision(slug)` — an
  optional dependency, `{ token, optional: true }`, which `BetterAuthPlugins.build` resolves to nothing
  where there is no tenancy (the migrator). Whichever process served the creation migrates it; if that
  fails it is logged and not thrown, because the schema exists and the tenant's first request migrates
  it anyway. Creating an organization also makes it the active one (Better Auth's default), which is
  what the web names as the tenant from then on.
- **Only an organization's members work in its tenant.** `TenantMembershipGuard`, installed by
  `TenantMembershipModule` as a global guard in a subgraph, reads the tenant a request names
  (`HeaderTenantResolver`), lets anybody into the root tenant, and anybody else only if the session's
  user is a member of the organization with that slug (`OrganizationRepository.findAllOf`). The
  session is the one the authentication guard put on the request when it ran first, and asked for
  otherwise; the verdict is remembered per request, because a guard on field resolvers runs once per
  field. A message passes: its publisher checked the tenant it carries. It is also what keeps an
  unknown tenant from being created — a header naming one is refused before any query runs.
