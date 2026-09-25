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
Nest container's schemas merged (`src/nest/config/schemas/*.schema.ts`: app and routing, auth,
AWS, billing, Inngest, Postgres, RabbitMQ) plus `POSTS_SUBGRAPH_URL`; `client` is the
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

## Billing

`/settings/billing` is better-auth-ui's billing view (`components/auth/billing`, copied from its
registry like every other auth screen), over Polar through `libs/billing` — see its README. It
exists only when `POLAR_ACCESS_TOKEN` is set: `WebAuth.billingEnabled()` decides, in the layout, whether
`billingPlugin` joins the plugins `AuthProvider` gets, and the settings route answers 404 for
`billing` otherwise. The user menu links to it when it is there.

The adapter (`lib/auth/billing-adapter.ts`) is better-auth-ui's Polar adapter with three operations
swapped for `libs/billing`'s endpoints: the plans come from the Polar catalog rather than a list
written here, the state of a user Polar has never seen is "no subscription" rather than an error,
and the portal creates the customer it opens. Checkout is the Polar plugin's, by product id. Only
personal billing is on — organization billing needs an authorization check the Polar plugin lacks.

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
