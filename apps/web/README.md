# web

The system's test client: Next.js (app router) + TanStack Query, through
`@nestposts/tanstack-query-graphql` (`libs/tanstack-query-graphql`), talking to **the federation
gateway** (`apps/gateway`), which federates the posts subgraph and the notifications one.

```bash
pnpm db:setup                          # the schemas, the default tag, the OAuth resource
npx nx serve @nestposts/posts-api      # the posts subgraph on :3000
npx nx serve @nestposts/notificator    # the notifications subgraph on :3002
npx nx serve @nestposts/gateway        # the gateway on :4000
npx nx serve @nestposts/web            # this app on :4200
```

`NEXT_PUBLIC_GATEWAY_URL` (default `http://localhost:4000/graphql`) is where every operation goes — the
proxy's upstream on the server, and the SSE endpoint of subscriptions in the browser.
`POSTS_SUBGRAPH_URL` (default `${NEXT_PUBLIC_API_URL}/graphql`) is the posts subgraph itself, which
only the federation page calls. The auth variables are the API's (see the root `CLAUDE.md`), plus
`WEB_TRANSPORT` and its broker address, because this server publishes the emails its Better Auth
sends.

## Environment: `src/env.mjs`

The one place this application reads its environment, with `@t3-oss/env-nextjs`. `server` is the
Nest container's schemas merged (`src/nest/config/schemas/*.schema.ts`: app and routing, AWS,
Inngest, RabbitMQ, and the libraries' own, `libs/database`'s, `libs/auth`'s and `libs/billing`'s) plus
`POSTS_SUBGRAPH_URL`; `client` is the
`NEXT_PUBLIC_*` the browser is given, listed again in `experimental__runtimeEnv` so Next inlines
them; `shared` is `NODE_ENV`. The container's `registerAs` factories read `env`, and so does every
server component and route. A variable declared empty counts as unset.

## Por onde os dados passam

**O `build` existe como script E como target do Nx**, e não é descuido. O Nx é quem constrói aqui
normalmente (`nx run @nestposts/web:build`, com cache e dependendo do `codegen`); o script existe
porque o **OpenNext** — que é quem empacota este app para a Lambda — roda `pnpm build` dentro deste
diretório e não sabe nada sobre Nx. Sem ele o deploy morre em `Command "build" not found`, depois de
já ter criado a infraestrutura toda.

**Queries e mutations vão por `/api/graphql`**, um route handler deste app que as repassa ao gateway. Não é enfeite: é ele que
põe o cookie da sessão na requisição de saída, e é por isso que o cookie nunca chega ao código de
cliente.

**Subscriptions não passam por ali.** Um route handler responde a uma requisição, e uma subscription é
um stream que fica aberto — o browser abre `…/graphql` direto no gateway, com `graphql-sse`, que é o
que ele fala: **GraphQL-over-SSE** no mesmo endereço das queries, em *distinct connections mode* (uma
requisição por subscription, porque o outro modo reserva o stream com um `PUT` e precisa que o mesmo
processo responda tudo dali em diante — o que uma função atrás de um balanceador não promete). Dá
para fazer isso porque `onPostCreated` e `onPostUpdated` são `@AllowAnonymous`: não há sessão a
reencaminhar.

## Queries run on the server, and the browser hydrates them into one cache

Every screen's query lives in its route's `query.ts`: the document, and a builder that turns it into
TanStack Query options — `feedPostsOptions()`, `postByIdOptions(id)`, `meOptions()` — minted by the
`GqlRpc` in `lib/graphql/gqlpc.ts`. The page, a server component, renders
`<PrefetchQuery options={…}>` (`<PrefetchInfiniteQuery>` for the feed) inside a `Suspense`: it awaits
the query on the server, dehydrates it into a `HydrationBoundary`, and the client component that calls
`useSuspenseQuery(sameOptions())` renders with data on its first frame, without a request of its own
and without suspending. What streams while the server fetches is the `Suspense` fallback.

There is **one** cache. The `QueryClient` (`lib/query-client.ts`) is built with the lib's
`GraphQueryCache` and `GraphMutationCache` over an Apollo `InMemoryCache`, so every result — hydrated
from the server, fetched in the browser, returned by a mutation or pushed by a subscription — is
normalized into it by `__typename` and `id`, and a query that mounts empty is filled from it. Apollo's
client is gone — no links, no `ApolloProvider`, no `PreloadQuery` — and its cache is what remains, as
the normalized store under TanStack Query.

- **`execute` has two transports** (`lib/graphql/execute.ts`). In the browser it posts to
  `/api/graphql`, or to `/api/graphql/posts` for the federation page's `_entities`, and the proxy puts
  the session cookie on the way out. On the server it goes straight to the gateway with the request's
  cookie and tenant: `lib/graphql/execute.server.ts` installs that transport on `globalThis`, and
  `lib/graphql/prefetch.tsx` imports it, so every server component that prefetches has it and no
  client bundle ever contains it.
- **A load that fails lands in a `QueryErrorBoundary`.** A prefetch that fails is not dehydrated, so
  the component suspends in the browser and asks again; if that fails too, TanStack's
  `useSuspenseQuery` throws — it always does when there is no data, unlike Apollo's under
  `errorPolicy: 'all'` — and the page's `QueryErrorBoundary` (`app/_components`) renders the same
  `ErrorNotice` the screen used to. A background refetch that fails does not throw: the data stays.
  `execute` throws a `GraphQLResponseError` for any response that carries `errors`, and the query
  client retries only what is not one, and nothing on the server.
- **`useSuspenseQuery` takes no `enabled`**, so a query that waits for something is a component that
  mounts when it is there: `/me`'s query lives in a child that renders only with a session. What
  runs on a click, on a timer or when a popover opens — `_entities`, the bell's count, the inbox — is a
  plain `useQuery`.
- **A write to Apollo does not re-render a mounted query** (the lib's README explains why). A mutation
  whose result a mounted query shows writes it with `setQueryData`, which `GraphQueryCache` mirrors
  into Apollo as well; one that changes a list's membership invalidates the list. The feed is an
  infinite query, which the lib keeps out of Apollo, so every write that changes it invalidates it.
- **Subscriptions** are `useSubscription(gqlSubscriptionOptions(…))` over `lib/graphql/subscribe.ts`,
  the `graphql-sse` client described above. `status: 'pending'` means the server accepted the stream,
  and that is what `/live`'s dot shows as open.
- **Codegen emits strings** (`documentMode: 'string'` in `codegen.ts`): the lib keys a query on its
  document's text and adds `__typename` to what goes over the wire.

## The tenant is the active organization

Every organization is a tenant, with its posts in a schema of its own (see the root `CLAUDE.md`), and
this application is what says which one a user is in. `WebAuth.tenantHeader()` answers with the
session's active organization's slug — or with an `x-tenant` the browser sent itself, which the
subgraphs check like any other — and it is what `/api/graphql` and the server-side transport put on
every request to the gateway. The SSE client sends the same slug, which `TenantSync`
(`app/_providers/tenant-sync.tsx`) keeps from better-auth-ui's active organization; when the active
organization changes — the header's switcher, or creating one, which makes it active — it empties
the normalized cache, resets every `['graph']` query and refreshes the server components, so the feed
is the new tenant's. No active organization is the root tenant.

The Nest container here holds a `TenancyModule` too, with the migrator's `tenantMigrations` list
(Turbopack has no directory to read migrations from): an organization created through these screens
is created by this process's Better Auth, and its plugin hook migrates the new tenant right here.

## Authentication: better-auth-ui, over this application's own Better Auth

Every auth screen is [better-auth-ui](https://better-auth-ui.com)'s, copied in from its shadcn
registry: `src/components/auth/**` are the views, `src/lib/auth/*-plugin.ts(x)` the plugin factories,
and `app/_providers/auth-providers.tsx` wires them — password with **required** email verification,
magic link, email code, two factor (authenticator, emailed code, backup codes), several accounts per
browser, organizations with teams, the admin screens and the OAuth consent screen.

The primitives under them — and under every other page here — are `@nestposts/ui`'s (`libs/ui`), the
repository's one design system: `components.json` points its `ui` and `utils` aliases there, so a
registry install writes the views here and the primitives there, and `globals.css` is that package's
theme plus the two font tokens `next/font` fills.

| route | what answers |
|---|---|
| `/auth/[path]` | sign-in, sign-up, forgot/reset password, magic link, email code, two factor, accept invitation, OAuth consent, sign-up and account selection |
| `/settings/[path]` | account, security (password, sessions, two factor, deletion, connected apps), organizations, OAuth clients |
| `/organization/[path]` | the active organization: settings, people, teams |
| `/admin/users` | the admin plugin's user management — `admin` role only |

The Better Auth behind them runs **here**, in the Nest container of `src/nest/`, against the API's
database and secret — so the cookie it writes belongs to this origin and is one the API resolves.
Every email those screens make Better Auth send is a notification that this server publishes on the
system's transport (`WEB_TRANSPORT`) and `apps/notificator` delivers; locally it lands in Mailpit, at
http://localhost:8025.

The session this application reads (`useSession()` in `app/_providers/session-provider.tsx`) is the
one better-auth-ui keeps in TanStack Query, prefetched by the layout — so signing in or out in those
screens reaches the header and the pages without a reload.

## Events

`/events/<view>-view` (`day`, `week`, `month`, `year`, `agenda`) is the calendar of the active
tenant. Its components live in `src/calendar`, brought over from the digital-twin project. There is
no query of its own for the screen: the layout prefetches `me`, `members` and `teams` together —
`PrefetchQueries`, one `Promise.all` over the same `QueryClient`, hydrated at once — and the provider
reads them back with `useSuspenseQueries`, then the events of the visible year with `events`,
filtered by team on the server and by person in the browser. The ids the screens hold are the
tenant's profile ids, the ones `me` answers with, never Better Auth's user ids: `members` is the people
picker, and it is also what `responsibleId` and `participantIds` take.

Whether the caller manages the calendar is not a field of the API. It is asked of Better Auth, on the
server, by the layout: `WebAuth.hasOrgPermission({ event: [...MANAGE_EVENTS] })`, the same statement
`@MemberHasPermission` checks on `createEvent`, `updateEvent` and `deleteEvent` (see
`libs/organizations`' Permissions). Whoever holds it — an owner or an admin of the active organization
— sees every event, picks the responsible, edits, deletes and drags events to another time; anybody
else sees the events they attend and creates their own. The root tenant is no organization's, so
there nobody manages and everybody keeps their own events. The dialogs are `@nestposts/ui`'s Base UI
primitives, the form is react-hook-form through the design system's `Form`, and the date, person and
team filters live in the URL, through nuqs.

`WebAuth` answers the other three questions the same way, for any screen that needs to show or hide a
control: `hasRole` (the system roles on the user), `hasPermission` (the system access control, through
the admin plugin's `userHasPermission`) and `hasOrgRole` (the caller's role in the active organization).
They hide controls; the API is what refuses.

## Billing

`/settings/billing` is better-auth-ui's billing view (`components/auth/billing`, copied from its
registry like every other auth screen), over Polar through `libs/billing` — see its README. It
exists only when `POLAR_ACCESS_TOKEN` is set: `WebAuth.billingEnabled()` decides, in the layout, whether
`billingPlugin` joins the plugins `AuthProvider` gets, and the settings and organization routes
answer 404 for `billing` otherwise. The user menu links to it when it is there, and each
organization's settings have the same view for the organization (`/organization/billing`).

The adapter (`lib/auth/billing-adapter.ts`) is better-auth-ui's Polar adapter as it comes, talking
to `@polar-sh/better-auth`'s own `checkout`, `portal` and `usage` endpoints, with one operation
swapped: the plans come from `libs/billing`'s catalog (`/billing/plans`) rather than a list written
here. Both scopes are on — personal and organization — because `libs/billing` checks every
`referenceId` the Polar plugin would otherwise take on trust. On the server, `WebAuth.billing()`
resolves the request-scoped `BillingService`, the same endpoints through `auth.api`.

## Theo: CopilotKit over the components this design system already has

`/theo` is a chat with Theo, the AG-UI agent on AgentCore (`apps/theo-agent`). The page is
CopilotKit v2's **headless** hooks — `useAgent({ agentId: 'theo' })` for the conversation and its run
status, `useCopilotKit().copilotkit.runAgent`/`stopAgent` to send and stop — drawn with `libs/ui`'s own
chat components (`MessageScroller`, `Message`, `Bubble`, `Marker`, `ChatComposer`), not CopilotKit's
styled ones. `TheoTranscript` reads the AG-UI messages the agent keeps into what the page shows: a
`send_message_to_a2a_agent` call is a **delegation card** ("Theo asked Posts Manager, over A2A"), and
the messages the posts agent said as an AG-UI subagent of that call (`subagentRunId` = the call's id)
are shown inside it, not as Theo's.

The provider talks to `/api/copilotkit`, where the **CopilotKit runtime** (`@copilotkit/runtime/v2`,
`createCopilotRuntimeHandler`) runs: for a signed-in person only — anyone else is a `401` before the
runtime is reached — with an agents factory that builds, per request, an `@ag-ui/client` `HttpAgent`
for Theo (`lib/agents/theo-agent.server.ts`). Its `fetch` adds what AgentCore needs and the browser
must never hold: an access token for the person, issued here by `WebAuth.delegatedToken` —
`libs/auth`'s `DelegatedAccessTokens`, this application being the authorization server — addressed to
Theo, the posts agent and the MCP server (`THEO_AGENT_AUDIENCES`), with the posts scopes the person
holds, and the thread as AgentCore's session id. The token is minted when a run is sent, not when the
runtime lists its agents. `COPILOTKIT_TELEMETRY_DISABLED=true` keeps the runtime from reporting to
CopilotKit, and pnpm runs no install script of `@scarf/scarf`.

The route streams, so on AWS the server function streams: `open-next.config.ts` picks OpenNext's
`aws-lambda-streaming` wrapper (see `infra/aws/web`).

### Theo's web searches

When Theo searches the web (`search_the_web`), the transcript shows it in its place —
`TheoTranscript` reads the call's query and, once the result arrives, the sources it listed
(`sourcesOf`: each `[n] title` followed by its URL) — and `WebSearchLine` draws "Theo searched the web
for …" with a link to every source, opened in a new tab. AWS's terms for AgentCore Web Search ask for
exactly that: the citations of a search reach whoever reads what came from it.

### A2UI, and the MCP Apps it carries

The provider has an **A2UI catalog** (`theo/_a2ui`: CopilotKit's basic components plus `McpApp`, id
`nestposts://a2ui/catalogs/theo/v1`), which is all it takes for CopilotKit to turn A2UI on: every
run tells the runtime so, the runtime's A2UI middleware hands Theo a `render_a2ui` tool and the
catalog's schema as context (Theo may draw a view of its own — the dynamic schema), and turns any tool
result shaped `{ a2ui_operations }` into an `a2ui-surface` activity. `TheoTranscript` places
activities where they arrived and the page draws them with `useRenderActivityMessage`, inside a
`CopilotChatConfigurationProvider` naming Theo, which is what tells the renderers whose agent to run.

`McpApp` is how the posts agent's **MCP App** (`apps/posts-app`) gets on screen: the delegation's
result carries an A2UI surface whose root names the server, the `ui://` resource, the tool, its input
and its result (`libs/ai/README.md`, "MCP Apps in A2UI"), and the renderer is CopilotKit's own MCP
Apps host, `MCPAppsActivityRenderer`: the sandbox iframes, the ext-apps `AppBridge`, the tool
input and result handed to the app, its `ui/message` and `ui/open-link`. Whatever the app asks of
the server — `resources/read` for its HTML, `tools/call` for its queries (`execute`) and its
buttons — the host sends to `/api/copilotkit` as a run of Theo's carrying
`__proxiedMCPRequest`, and `McpAppsProxy` (`lib/agents/mcp-apps-proxy.ts`), the first middleware on
Theo's per-request agent, answers it with CopilotKit's `MCPAppsMiddleware` against the posts MCP
server, as the person (`PostsMcpApp` issues the token: `POSTS_MCP_RESOURCE`, the posts scopes) and in
app mode (`?app=posts&appTarget=mcp`, and the AgentCore header that stands for it). Every other run
reaches Theo untouched: the middleware would otherwise list the server's tools on every run and offer
them to Theo itself, which is the posts agent's job. Its methods are the middleware's allowlist
(`tools/call`, `resources/read`, `ping`, `notifications/message`), and what the server lets an app
call is the server's: the app's tools and a read-only `execute`.

- **CopilotKit's sandbox is `allow-scripts allow-same-origin`, twice, on `srcdoc`**, so the app runs
  with the web's own origin — fine for an app this repository builds and serves, and the reason not to
  put a third party's MCP App behind `McpApp`.
- **A message the app adds does not replace `agent.messages`**: `addMessage` pushes onto the same
  array, so the transcript is derived on every render rather than memoized on the array's identity
  — memoized, a person's save reached the page only with the next run.
- **The catalog's schemas are `zod/v3`.** `@copilotkit/a2ui-renderer` reads a component's props
  through Zod 3's internals (`_def.typeName`) and converts them with `zod-to-json-schema`; Zod 4's
  `zod/v3` is that implementation, but its types are not the renderer's, so the props are cast at the
  boundary and typed by hand (`McpAppProps`).

## Federação

`apps/posts-api` é um **subgraph** — driver `YogaFederationDriver` —, e `/federation` é a única tela
daqui que fala com ele diretamente, sem passar pelo gateway (a operação sai pelo `GqlRpc` do
subgraph, `postsSubgraphQueryOptions`, e por `/api/graphql/posts`), porque chama o que nenhuma outra
chamaria: `_entities(representations:)`, que é por onde um
roteador de federação resolve uma entidade a partir da chave, e não de uma query. A tela monta o lote
com o que o feed já sabe — um `Post`, o `Author` dele, as `Tag`s — e junta as duas recusas que são a
parte interessante: um autor pedido como `User`, e uma chave que não resolve nada. As duas voltam
`null`, cada uma na sua posição, sem erro. A chamada é anônima de propósito: o roteador não tem
sessão.

O que a federação acrescenta ao schema — `_Any`, a união `_Entity` e `Query._entities` — não está em
nenhum `.graphql` da API: quem o põe lá é o `buildSubgraphSchema`, em tempo de execução. Como o
`codegen` lê o SDL do disco, essa parte está declarada em `federation.graphql`, na raiz deste app, e
entra na lista de schemas do `codegen.ts`. É o contrato do que o servidor serve, escrito onde o
cliente consegue lê-lo — e se ele divergir, o documento que o usa quebra a geração.

## O que o schema daqui não tem

O app veio do `axon-graphql-posts`, e duas coisas não atravessaram porque esta API não as expõe:
`deletePost`/`restorePost` (o soft delete existe no domínio, não no schema) e
`User.accounts`/`Author.bio`. The `codegen` reads the gateway's composed API schema
(`apps/gateway/dist/supergraph/api.graphql`, which its target builds first), so a document asking for
a field that no subgraph serves breaks the generation — which is where one wants to find out.
