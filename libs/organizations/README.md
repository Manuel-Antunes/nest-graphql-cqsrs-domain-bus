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

## `OrganizationNotSelected` and `ActiveMemberNotFound` are different failures

The first says the session has not picked an organization; the second says the caller picked one they
do not belong to. `requireActiveMember()` throws them apart on purpose and
`AuthExceptionFilter` gives them different codes — one is a prompt, the other a refusal.

## The tenant schema

`Organization` carries a MikroORM `trigger` that creates `tenant_<slug>` on insert and drops it
`cascade` on delete, emitted into a migration like any other DDL. It quotes with `%I`: a slug may
contain a dash, and `tenant_acme-corp` is not a valid unquoted identifier. See
`libs/database/README.md` for what routes queries there, and `libs/auth/README.md` for the rest of
the Better Auth wiring.
