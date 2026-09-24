# `@nestposts/federation-gateway`

A GraphQL federation gateway as a NestJS module: it composes a supergraph from its subgraphs' SDL,
executes it — queries, mutations **and subscriptions over SSE** — and forwards each caller's
credentials to every subgraph an operation reaches.

```ts
@Module({
  imports: [
    FederationGatewayModule.forRoot({
      subgraphs: [
        { name: 'posts', url: 'http://posts:3000/graphql', sdlDir: '/app/subgraphs/posts' },
        { name: 'notifications', url: 'http://notificator:3002/graphql', sdlDir: '/app/subgraphs/notifications' },
      ],
      tokenVerifier: new JwksGatewayTokenVerifier({ jwksUrl, issuer, audience }),
      cors: { origin: ['https://app.example.com'], credentials: true },
    }),
  ],
})
export class AppModule {}
```

The module installs `GraphQLModule` itself, with `YogaDriver`; an application does not configure
GraphQL again. `GET /graphql/schema.graphql` serves the composed **API** schema — the supergraph with
the federation machinery stripped — for tooling that needs the schema without introspecting.

## Execution: a stitched schema, not Apollo's gateway

`YogaGatewayDriver` is `@apollo/gateway` behind Yoga: it starts an `ApolloGateway` and hands Yoga a
schema that stays empty until then. Apollo's gateway refuses to execute subscriptions, so putting SSE
in front of it changes the wire format and nothing about what can run. This module builds the
executable schema with `@graphql-tools/federation`'s `getStitchedSchemaFromSupergraphSdl`, which
executes subscriptions — `federated-subscriptions.spec.ts` asserts every event of a federated
subscription reaching a `graphql-sse` client, in order.

## Composition: local, from SDL files

`LocalComposeSupergraph` reads each subgraph's `.graphql` files and composes them with
`@apollo/composition` — the composer Apollo's gateway and router use — so what runs is what
`rover supergraph compose` would print. Nothing is introspected at boot: introspection makes the
gateway's start wait on every subgraph, and on Lambda one cold subgraph cascades into a gateway that
answers 504 until both are warm. SDL files are build artifacts; composing them cannot cascade.
Routing still targets each subgraph's live URL.

A schema-first subgraph's files are **merged**, the way `@nestjs/graphql` merges `typePaths`
(`mergeTypeDefs`), not concatenated: two files that each declare `type Mutation` are one type to Nest
and a composition error as text. A supergraph that does not compose stops the boot with every reason
composition gave (`SupergraphCompositionException`), instead of serving a schema that answers every
operation with a validation error.

`deriveApiSchemaSdl` prints with `@apollo/federation-internals`' own printer, never `graphql`'s: that
package is CommonJS with its own `graphql`, and wherever `graphql` also loads as ESM — Vitest, for
one — the two are different realms and graphql-js refuses the other's types.

## Credentials: what each subgraph is sent

Once per inbound request — never once per subgraph call — `StitchedGateway.resolveSubgraphHeaders`
decides each subgraph's headers:

- the forwarded headers, `cookie`, `authorization` and `x-tenant` by default (`forwardedHeaders`
  replaces the list);
- `x-gateway: true`;
- the tenant: the inbound `x-tenant`, or else the organization the verified bearer is bound to;
- per subgraph, either the native credential its `SubgraphTokenResolver` translates the identity
  into, or the inbound bearer untouched.

Trace context is deliberately **not** forwarded: the gateway's own HTTP instrumentation writes
`traceparent` on each outbound call, so a subgraph's span is a child of the gateway's (see Tracing).

Every entry is filed under the subgraph's name **and** its `join__Graph` enum value (`joinGraphEnumName`):
`httpExecutorOpts` identifies a subgraph by the enum value, and headers filed only under the name miss
silently — the subgraph is called anonymously, answers `Unauthorized`, and `{ __typename }`, which
reaches no subgraph, keeps passing. `subgraph-header-forwarding.spec.ts` drives the real executor
against a subgraph that reports what it received.

`GatewayTokenVerifier` is the port the bearer is verified through; `JwksGatewayTokenVerifier` checks
a JWT against the issuer's published keys (cached by `jose`, refetched when a token names a key it has
not seen), and answers `null` for anything that is not a signed token — an opaque session token costs
no network call. A `null` identity still forwards the header: each subgraph decides for itself.

## Tracing

Every subschema executor is wrapped by `tracedExecutor`: one client span per call to a subgraph,
`subgraph posts`, with `graphql.subgraph.name` and the operation's type and name. The HTTP request
runs inside it, so the `traceparent` it carries makes the subgraph's work a child of that span, and a
gateway trace reads as a query plan. A subscription's span lasts as long as its stream.

The subgraph's own events carry the trace they were delivered in (`extensions.traceparent`, which
`useGraphQLTracing` writes), and the executor remembers it for the objects of each event's `data`.
`subgraphEventOrigin(payload)` answers it, so the gateway's delivery continues the same trace:

```ts
FederationGatewayModule.forRoot({
  // …
  plugins: [useGraphQLTracing({ resolvers: false, originOf: subgraphEventOrigin })],
});
```

`plugins` goes to the gateway's Yoga as is. The spans are `@opentelemetry/api` only — a no-op until
the application starts an SDK. `traced-executor.spec.ts` drives a stitched gateway against a subgraph
that stamps its events.

## `@interfaceObject`

A subgraph may contribute fields to an entity **interface** without knowing its implementations —
it keeps an id and nothing else. `@graphql-tools/federation` implements none of it: no published
version mentions `isInterfaceObject`, nothing fails at composition, and the contributed field simply
has no resolver — a non-null one takes its whole parent down.

`execution/interface-object.ts` reproduces what Apollo does:

- `applyInterfaceObjects` makes every implementation an entity of the contributing subgraph under the
  same key, and pins the fields each implementation already had to the graphs that owned them — a
  field with no `@join__field` means "every graph declaring the type serves it", and without the pin
  it silently claims the new graph too;
- `implementationTypeDefs` gives the contributing subgraph the implementation types it never
  declared, so the stitcher plans fetches for them;
- `interfaceObjectKeyFn` builds the representation under the **interface's** `__typename` — the only
  name the contributing subgraph knows — while keeping the library's own key projection;
- `rewriteInterfaceObjectTypeConditions` rewrites `... on Author { … }` into `... on IUser { … }` in
  the document sent to that subgraph, which would otherwise reject it with `Unknown type "Author"`.

`@requires` travels with the contributed field and is resolved by the library's existing machinery.

One case is **not** handled: a contributing subgraph that hands out bare references to the interface
(`recipient: IUser`) whose id the owning subgraph cannot resolve. The owner's `_entities` answers
`null`, no concrete `__typename` replaces the interface's, and graphql-js cannot complete the abstract
value — which nulls every non-null ancestor rather than the one field. It needs a one-line fix in
`@graphql-tools/delegate`'s `resolveExternalValue` (null an abstract value whose resolved type is not
an object type). A subgraph here that only **contributes** fields, and never returns the interface,
never meets it.
