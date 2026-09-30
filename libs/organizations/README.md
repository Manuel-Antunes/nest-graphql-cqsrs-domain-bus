# `@nestposts/organizations`

Organizations, members and invitations: the three tables Better Auth's `organization` plugin owns,
given this repository's shape, and the service that answers what the caller may do inside one.

It is built **on** `@nestposts/auth` and the dependency only runs that way. Authentication does not
know organizations exist — that is what lets a service authenticate without one.

## What is here, and what stayed in `@nestposts/auth`

| | `@nestposts/auth` | this package |
|---|---|---|
| the instance | builds it (`BETTER_AUTH`), with the CORE plugins | contributes the `organization` plugin to it |
| tables | `users` (`AuthUser`, a kind of `User`), and everything Better Auth generates | `organization`, `member`, `invitation` |
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
column on each of `session` (`active_team_id`) and `invitation` (`team_id`). All of them are mapped
here: `Team` and `TeamMember` join `ORGANIZATION_MODELS`, and `invitation` carries `teamId`.
better-auth-ui's organization screens show the teams tab, the team switcher and the team picker in
the invite dialog.

**The team tables are connected by references, like `member` is.** `Team.organization` is a
`Ref<Organization>`, and `TeamMember.team` and `TeamMember.user` are a `Ref<Team>` and a
`Ref<AuthUser>`; the adapter maps Better Auth's `organizationId`, `teamId` and `userId` onto them by
column (`organization_id`, …), as it does for `member`. Every one of those foreign keys is
`on delete cascade`, and that is Better Auth's rule, not a choice made here: the schema it generates
for itself declares its references with `cascade` by default, and it relies on it —
`deleteOrganization` removes the members and the invitations and then the organization, never the
teams, and a team member goes with its team or its user the same way. `Migration…_team_references`
turned the generated `varchar(255)` columns into those keys, after deleting the teams and team
members an organization's deletion had already orphaned. `Team` declares `memberCount` without an
initializer, because Better Auth writes it (`incrementOne` on every membership) and MikroORM reads an
initializer as a column default. It has no collection of its members: the adapter serializes the
whole entity and refuses a one-to-many property, so `TeamMemberRepository` is how a team's members
are read — the calendar of `@nestposts/events` expands a team into participants with it.

`Invitation.teamId` stays a string, deliberately: Better Auth writes the ids of **every** team an
invitation names there, joined by commas, and splits them when it is accepted. It is a list, not a
reference.

Better Auth creates a **default team** named after the organization when it creates the
organization, and nothing marks it as such. It is an ordinary team here.

## `OrganizationNotSelected` and `ActiveMemberNotFound` are different failures

The first says the session has not picked an organization; the second says the caller picked one they
do not belong to. `requireActiveMember()` throws them apart on purpose and
`OrganizationsExceptionFilter` (`filters/`) gives them different codes — one is a prompt, the other a
refusal.

## An organization is a tenant

A tenant's rows live in a schema of its own, `tenant_<slug>` — see `libs/database/README.md` for the
entity manager that routes there, and the root `CLAUDE.md` for the whole path. This library owns the
three things that make an organization one:

- **The schema is created with the row.** `Organization` carries a MikroORM `trigger` that creates
  `tenant_<slug>` on insert and drops it `cascade` on delete, emitted into a system migration like any
  other DDL. It quotes with `%I`: a slug may contain a dash, and `tenant_acme-corp` is not a valid
  unquoted identifier. The triggers live in `infrastructure/persistence/triggers/`, beside the
  entities that declare them.
- **Chatwoot mirrors the organization, its members and its teams.** `organization`, `member`, `team`
  and `team_member` each carry a `chatwoot_sync` trigger (`chatwoot-sync.triggers.ts`) that keeps
  `apps/chatwoot`'s account, seats and teams in step, one way; `libs/users` does the same for
  `users`. They do nothing while the `chatwoot` schema is absent, and nothing for a table outside
  `public`. An organization deleted here is a Chatwoot account suspended, not removed: Chatwoot keeps
  its conversations. The mapping and the reasons are in the root README's Chatwoot section.
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
- **A handler checked against the active organization works only in its tenant.** `@OrgRoles`,
  `@MemberHasPermission` and `@RequireActiveOrg` (`@thallesp/nestjs-better-auth`) ask Better Auth
  about the session's **active** organization — the library calls `hasPermission` and
  `getActiveMemberRole` without an `organizationId` — while the rows a request touches are the named
  tenant's. Membership alone would let an owner of one organization, with it active, name another
  where they are only a member and act there with the first one's role. So on a handler carrying any
  of those decorators the guard also requires the tenant to be the active organization's, and refuses
  the root tenant, which is no organization's. The metadata keys are read off the library's own
  decorators (`RequireActiveOrg().KEY`, `MemberHasPermission(…).KEY`; `@OrgRoles` sets the first),
  so a rename upstream cannot leave the check silently off. The web names the active organization as
  the tenant, so for it the two are always the same; the rule is for whoever names one by hand.

## Permissions

`access.ts` is the organization's access control, and Better Auth evaluates it: `hasPermission` on
the server, `WebAuth.hasOrgPermission` in `apps/web`, `@MemberHasPermission` on a resolver. Beside
Better Auth's own statements it declares two resources: `post` (`WRITE_A_POST`, from `libs/auth`) and
**`event`** (`MANAGE_EVENTS`: `read`, `create`, `update`, `delete`), which owners and admins hold and
members do not. On an event they are about *every* event of the organization — reading them all,
scheduling one for somebody else, changing or removing any — and never about the caller's own: any
member creates their own events, and sees the ones they attend. `access.spec.ts` pins who holds it.
