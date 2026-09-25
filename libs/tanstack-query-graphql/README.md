# @nestposts/tanstack-query-graphql

Bridges TanStack Query with Apollo's normalized cache for GraphQL operations.

- **TanStack Query** — hooks, request dedup, background refetch, SSR hydration
- **Apollo `InMemoryCache`** — entity normalization, so an update in one query
  reaches every other query holding the same entity
- **graphql-codegen** — `TypedDocumentString` carries result + variable types

## Why a lib

`apps/web`, `apps/digital-twin` and `apps/vaz-twin-companion` each had (or
needed) the same three pieces: option builders keyed for Apollo, the two cache
subclasses, and `__typename` injection. Only the transports genuinely differ per
app — Next.js goes through `@/lib/api-client` and raises server interrupts, the
browser extension posts to its background service worker — so `execute` and
`subscribe` are what the app injects.

## Setup

Three pieces have to agree on **one** `GraphCache` instance: the two cache
subclasses handed to the `QueryClient`, and the `GqlRpc` instance. If they
diverge, everything still appears to work — queries resolve, mutations succeed —
but hand-written cache updates land in an object nobody reads.

### 1. The cache instance

```ts
// apps/<app>/src/orpc/query-client.tsx
import { GraphMutationCache, GraphQueryCache, InMemoryGraphCache } from '@nestposts/tanstack-query-graphql';
import type { GraphCache } from '@nestposts/tanstack-query-graphql';
import { environmentManager, QueryClient } from '@tanstack/react-query';

import generatedIntrospection from '../graphql/__gen__/possible-types.json';

let apolloCacheSingleton: GraphCache | undefined;

export const getGraphCache = (): GraphCache => {
  // Server: a fresh cache per call — never share normalized entities between
  // requests, they are per-user data.
  if (environmentManager.isServer()) {
    return new InMemoryGraphCache({
      possibleTypes: generatedIntrospection.possibleTypes,
    });
  }
  // Browser: one cache for the tab's lifetime, so every query and mutation
  // normalizes into the same store.
  return (apolloCacheSingleton ??= new InMemoryGraphCache({
    possibleTypes: generatedIntrospection.possibleTypes,
  }));
};
```

A module-level `let` is enough in production, where the module is evaluated
once. If you want the singleton to survive Fast Refresh in dev — or you want to
poke at the store from the devtools console — pin it to `window` instead:

```ts
declare global {
  interface Window {
    __GRAPH_CACHE__?: GraphCache;
  }
}

export const getGraphCache = (): GraphCache => {
  if (environmentManager.isServer()) {
    return new InMemoryGraphCache({
      possibleTypes: generatedIntrospection.possibleTypes,
    });
  }
  return (window.__GRAPH_CACHE__ ??= new InMemoryGraphCache({
    possibleTypes: generatedIntrospection.possibleTypes,
  }));
};
```

Fast Refresh re-evaluates the module and resets a module-level `let`, which
silently drops every normalized entity mid-session; `window` outlives it. The
same trick guards against the module being instantiated twice by two bundles.

### 2. The QueryClient

Both cache subclasses take the same instance:

```ts
export const createQueryClient = () => {
  const cache = getGraphCache();

  return new QueryClient({
    defaultOptions: { queries: { staleTime: 30 * 1000 } },
    queryCache: new GraphQueryCache(cache),
    mutationCache: new GraphMutationCache(cache),
  });
};
```

### 3. The GqlRpc instance

`GqlRpc` takes the transports **and** the cache — the cache is what
`updateCache` (below) receives, and the third argument is the subscription
transport (optional; omit it in an app that never subscribes):

```ts
// apps/<app>/src/graphql/gqlpc.ts
import { GqlRpc, useInfiniteFragment } from '@nestposts/tanstack-query-graphql';

import { getGraphCache } from '@/orpc/query-client';
import { execute } from './execute';
import { subscribe } from './subscribe';

export const gqlrpc = new GqlRpc(execute, getGraphCache(), subscribe);
type GQLRPC = typeof gqlrpc;

// The explicit annotations keep the generic signature that `bind` would
// otherwise widen, so every call site stays fully typed.
export const gqlQueryOptions: GQLRPC['gqlQueryOptions'] = gqlrpc.gqlQueryOptions.bind(gqlrpc);
export const gqlInfiniteOptions: GQLRPC['gqlInfiniteOptions'] = gqlrpc.gqlInfiniteOptions.bind(gqlrpc);
export const gqlMutationOptions: GQLRPC['gqlMutationOptions'] = gqlrpc.gqlMutationOptions.bind(gqlrpc);
export const gqlSubscriptionOptions: GQLRPC['gqlSubscriptionOptions'] = gqlrpc.gqlSubscriptionOptions.bind(gqlrpc);

export { useSubscription, useInfiniteFragment };
```

`./subscribe` is a `'use client'` module in `apps/web`, so in the RSC graph that
third argument is a _client reference_ rather than the function. That is exactly
right — a subscription only ever opens in the browser — and it costs nothing:
`gqlSubscriptionOptions` closes over it without calling it, so the server
components importing this file for `gqlQueryOptions` are unaffected and
`graphql-sse` never loads on the server.

> **On the server the two caches are not the same object.** `gqlpc.ts` resolves
> `getGraphCache()` once at module load, while `createQueryClient()` resolves it
> again per request — and the server branch mints a new cache every call. So a
> mutation executed during SSR writes through `updateCache` into a cache no
> `QueryClient` is reading. That is harmless as long as mutations run in the
> browser, where the singleton makes both sides the same object. Don't rely on
> `updateCache` from a server action or an RSC.

### 4. execute

```ts
// the app's execute
import { toRequestString } from '@nestposts/tanstack-query-graphql';

const body = { query: toRequestString(document), variables };
```

## The contract

Everything below hinges on the key shape `GqlRpc` mints:

| operation    | key                                                        |
| ------------ | ---------------------------------------------------------- |
| query        | `['graph', normalizedDocument, variables]`                 |
| infinite     | `['graph', normalizedDocument]`                            |
| mutation     | `['graph', normalizedDocument]`                            |
| subscription | `['graph', 'subscription', normalizedDocument, variables]` |

`GraphQueryCache` recognises that prefix and mirrors successful results into
Apollo; `GraphMutationCache` writes mutation results back so related queries
pick up the new entity state. Mint a key some other way and the queries still
work — they just stop sharing normalized entities, silently.

Infinite queries are deliberately skipped by `GraphQueryCache`: their state is
`InfiniteData` (`{ pages, pageParams }`), which never matches the document shape
Apollo keys on. They are served from TanStack Query alone.

The subscription key is four elements, and that is load-bearing: `['graph', doc,
vars]` is what `GraphQueryCache` mirrors into Apollo with `writeQuery`, and a
subscription's root fields are not query fields — they would land under
`ROOT_QUERY`, where a `readQuery` for an unrelated query would trip over them.
Being a different length makes the key invisible to `isGraphQLQueryKey` and
`isGraphQLMutationKey`. Subscription payloads reach Apollo the way Apollo's own
client writes them: `ROOT_SUBSCRIPTION`, see below.

## Server prefetch and hydration

A query prefetched on the server reaches the browser as dehydrated state, and
`hydrate` builds it with that state already set. `GraphQueryCache.add` tells the
two arrivals apart by whether the query brings data:

| the query arrives | what happens |
| --- | --- |
| with data (hydrated, or `initialData`) | it is **written into** Apollo, and Apollo's copy never replaces it |
| empty (a `useQuery` mounting first) | it is **filled from** Apollo when Apollo can answer the whole document |

The first row is what makes server data part of the normalized store at all:
`build` adds a query without an `updated` event, so the mirror that listens for
one would never see it. The server copy wins, however old it is by the time it
hydrates. An earlier version compared `dataUpdatedAt` with a one-second window,
which let a stale Apollo entry from a previous visit overwrite a fresh server
result and stamp it as current.

Removing a query (garbage collection, `removeQueries`, `clear`) evicts the root
fields it selected, under the arguments its variables resolve to, including
the ones a fragment spread at the root selects. So `posts(first: 6)` goes and
`posts(first: 12)` stays, and a query that mounts after its predecessor was
collected fetches instead of reviving what Apollo held.

`apps/web` prefetches with the options builders themselves:
`queryClient.prefetchQuery(postByIdOptions(id))` on the server and
`useQuery(postByIdOptions(id))` in the browser mint the same key, which is all
hydration needs.

## Updating the cache after a mutation

`gqlMutationOptions` accepts `updateCache`, the equivalent of Apollo's
`useMutation({ update })`. It runs after a successful mutation and receives the
`GraphCache` passed to the `GqlRpc` constructor plus the mutation result:

```ts
updateCache?: (cache: GraphCache, data: TResult) => void;
```

### You usually don't need it

`GraphMutationCache` already writes every mutation result into Apollo. If your
mutation returns an entity that is **already** in the cache, normalization
patches it everywhere it is referenced — no `updateCache`, no refetch:

```ts
// renameTodo returns Todo { id: "1", text: "renamed" }
// → every cached list holding Todo:1 shows the new text. Nothing to write.
useMutation(gqlMutationOptions(RENAME_TODO));
```

Reach for `updateCache` when **list membership** changes — a create that must
appear in a list, a delete that must leave one. Apollo cannot infer that from
the mutation payload.

### Appending to a list

The Apollo `cache.modify` + `cache.writeFragment` recipe, unchanged:

```ts
import { gql } from '@nestposts/tanstack-query-graphql';
import type { Reference } from '@nestposts/tanstack-query-graphql';

const NEW_TODO = gql`
  fragment NewTodo on Todo {
    id
    text
  }
`;

const { mutate } = useMutation(
  gqlMutationOptions(ADD_TODO, {
    updateCache: (cache, data) => {
      cache.modify<{ todos: Reference[] }>({
        fields: {
          todos(existing = []) {
            const newTodoRef = cache.writeFragment({
              data: data.addTodo,
              fragment: NEW_TODO,
            });
            return [...existing, newTodoRef as Reference];
          },
        },
      });
    },
  }),
);
```

`gql` and the `Reference` / `StoreObject` types are re-exported from this lib on
purpose: `apps/web` has no `@apollo/client` dependency of its own, and its whole
Apollo surface arrives through here.

### Removing from a list

```ts
updateCache: (cache, data) => {
  const id = cache.identify(data.deleteTodo);
  cache.modify<{ todos: Reference[] }>({
    fields: {
      todos: (existing = [], { readField }) => existing.filter((ref) => readField('id', ref) !== data.deleteTodo.id),
    },
  });
  cache.evict({ id });
  cache.gc();
};
```

### What `updateCache` does _not_ do

**It does not refresh queries that are already mounted.** `GraphQueryCache`
hydrates a query from Apollo when the query is _added_; it never subscribes to
Apollo. So after `updateCache` appends a todo, Apollo holds the new list but a
mounted `useQuery` still renders the snapshot it fetched with. Close the gap in
`onSuccess`:

```ts
gqlMutationOptions(ADD_TODO, {
  updateCache: appendTodo,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['graph', normalizeQueryKey(GET_TODOS.toString())] });
  },
});
```

So what is `updateCache` buying you, if you invalidate anyway? Queries mounted
_after_ the mutation — the next route, a dialog, a detail panel — hydrate
straight from Apollo with the corrected data, rendering it immediately instead
of a spinner. Without `updateCache` they hydrate a stale list. Whether they also
skip the network depends on `staleTime`: hydration stamps `dataUpdatedAt` with
the current time, so with `apps/web`'s 30 s default the fetch is skipped
outright, while `staleTime: 0` still revalidates in the background behind the
correct data. Use both: `updateCache` for correctness of the store,
`invalidateQueries` for the view you're looking at.

### Gotchas

| Gotcha                                                                                             | Why                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A throw inside `updateCache` marks the mutation **failed**, even though the server call succeeded. | It runs inside TanStack Query's `onSuccess`. Keep cache edits total, or wrap them in `try`/`catch`.                                                               |
| `updateCache` runs _before_ your own `onSuccess`.                                                  | So `onSuccess` observes an already-updated store.                                                                                                                 |
| `cache.modify` needs its `Entity` generic — `cache.modify<{ todos: Reference[] }>`.                | Without it the modifier is typed against `Reference \| (Reference \| undefined)[]` and your callback won't type-check.                                            |
| The entity type you pass to `cache.identify` must be a `type`, not an `interface`.                 | `StoreObject` needs a string index signature; TS gives type aliases an implicit one and interfaces none. Codegen emits type aliases, so real call sites are fine. |
| `updateCache` is a browser concern.                                                                | See the SSR note in **Setup** — during SSR the `GqlRpc` cache is not the request's cache.                                                                         |

## Subscriptions

`gqlSubscriptionOptions` + `useSubscription` are to a GraphQL subscription what
`gqlQueryOptions` + `useQuery` are to a query: the builder decides _what_ to
listen to, the hook decides _when_, and the stream's lifetime is the
component's.

**The two halves are separable on purpose.** `useSubscription` — everything
under [`src/lib/subscriptions/`](./src/lib/subscriptions) — has no GraphQL in
it: it takes a `subscribe` function, a `queryKey` and callbacks, so a WebSocket,
an `EventSource` or an event bus wires in the same way. Every GraphQL concern
(the document, the variables, the normalized cache, the error type) belongs to
`gqlSubscriptionOptions`, which hands the hook a plain `SubscriptionOptions`.
That folder imports nothing but React and `@tanstack/react-query`, so lifting it
into a standalone package is a move, not a rewrite.

```tsx
'use client';

import { useSubscription, gqlSubscriptionOptions } from '@/graphql/gqlpc';

const OnBatchProgress = graphql(`
  subscription OnBulkGeneratePetitionsForCreditors($batchKey: ID!) {
    onBulkGeneratePetitionsForCreditors(batchKey: $batchKey) {
      batchKey
      status
      succeededCount
      failedCount
    }
  }
`);

function BatchProgress({ batchKey }: { batchKey: string | null }) {
  const sub = useSubscription(
    gqlSubscriptionOptions(OnBatchProgress, {
      // The switch: nothing to watch yet. The hook still runs, idle.
      enabled: Boolean(batchKey),
      input: batchKey ? { batchKey } : null,
    }),
  );

  if (sub.status === 'idle') return null;
  if (sub.status === 'error') return <Alert>{sub.error.message}</Alert>;
  if (!sub.data) return <Skeleton />;

  return <Progress value={sub.data.onBulkGeneratePetitionsForCreditors.succeededCount} />;
}
```

### `enabled`, and why the hook is called unconditionally

The imperative shape — `const stop = subscribe(doc, vars, handlers)` stashed in
a ref inside a callback — makes every screen that watches something re-solve the
same three problems: unsubscribe on unmount, unsubscribe _before_
re-subscribing, and don't call a hook conditionally when there is nothing to
watch yet. That last one is what pushes people to imperative code in the first
place: the execution id does not exist until a mutation mints it, so the hook
"cannot" be called on the first render.

It can. Call it always, and let `enabled` decide:

```ts
gqlSubscriptionOptions(OnBatchProgress, {
  enabled: Boolean(executionId), // ← the switch
  input: executionId ? { executionId } : null,
});
```

**`enabled` is the switch; `input: null` only avoids lying about the types.**
There is no `{ executionId: string }` to hand over while the id does not exist,
and `null` says so without an `!`. Which line turns the stream on should not be
something a reader has to infer from a ternary in the variables.

`enabled` does default to `input !== null`, but treat that as a guard rather
than the mechanism: without it, forgetting `enabled` would open a stream with no
variables and have the server reject an operation the client never meant to
send. Readiness is often a different question anyway — `enabled: !!executionId
&& dialogIsOpen` — and an explicit `enabled` always wins.

A document that takes no variables is not "not ready": it stays enabled.

### Ordering: subscribe, then dispatch

For anything keyed on an id the client mints — every batch operation here — the
subscription has to exist before the mutation that feeds it is sent. A batch can
finish in 300 ms, and an event published to a subject nobody is listening on is
gone.

There is no helper for this, and there does not need to be one. The id goes in
state, the state drives `enabled`, and the mutation is sent by an effect when
the status reaches `pending` — which is exactly "the server accepted the
stream":

```tsx
const [pending, setPending] = useState<{ batchKey: string; selection: S } | null>(null);

const sub = useSubscription(
  gqlSubscriptionOptions(OnBatchProgress, {
    enabled: pending !== null,
    input: pending ? { batchKey: pending.batchKey } : null,
  }),
);

// Keyed on the batch, so a RECONNECT — which passes through `pending` again —
// does not send the mutation a second time.
const sent = useRef<string | null>(null);
useEffect(() => {
  if (!pending || sub.status !== 'pending' || sent.current === pending.batchKey) return;
  sent.current = pending.batchKey;
  void mutateAsync({ input: { batchKey: pending.batchKey, ...pending.selection } });
}, [pending, sub.status]);

// The click. Synchronous — everything after it is driven by the stream.
const dispatch = (selection: S) => setPending({ batchKey: crypto.randomUUID(), selection });
```

The selection is captured at the click, in state, because the mutation goes out
later — by which point the table may well have cleared the rows the user picked.

An earlier version of this lib shipped an awaited `whenSubscribed()` for the
same job. It was strictly weaker: SSE has no handshake, so the promise could
only ever mean "the subscribe request left the browser". `pending` means the
server answered. Waiting on the status is both the stronger guarantee and less
machinery.

> ⚠️ **This needs a transport that reports `connected`.** Without one the status
> only reaches `pending` on the first PAYLOAD — and a stream whose first payload
> is caused by the very mutation you are holding back would wait for itself
> forever. `apps/web`'s SSE transport reports it; see **Transports**.

Two consequences worth planning for, both of which the old shape hid:

- **Nothing accepts the stream → nothing is dispatched.** `graphql-sse` retries
  forever by design, so a gateway that never answers sits in `connecting`
  indefinitely. Bound it: `apps/web` gives up after 30 s and says so, rather
  than spinning over a batch that was never asked for.
- **The dispatch cannot be awaited.** Whatever the mutation returns — including
  a business refusal like "nothing is eligible" — arrives after the click
  handler is long gone. Render it from state, not from a `catch`.

### The contract is tRPC's

`useSubscription` is `@trpc/tanstack-react-query`'s `useSubscription`:
same statuses, same discriminated union, same split between the **connection**
(`onConnectionStateChange`) and the **result** (`status` / `data` / `error`).
That is not imitation for its own sake — the split is what makes a
dropped-and-retried stream expressible at all: the connection goes back to
`connecting` while the last snapshot stays on screen, instead of the whole thing
reading as a failure.

One deliberate difference:

| difference                 | why                                                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| an extra `complete` status | tRPC returns to `idle` when a subscription ends, which clears `data`. Every batch here _ends by publishing its result_ — the assembled archive's download URL — so that would discard the one thing the user waited for. |

### What you get back

| field          | meaning                                                       |
| -------------- | ------------------------------------------------------------- |
| `status`       | `idle` → `connecting` → `pending`, or `error` / `complete`    |
| `data`         | the **last** payload, `undefined` until the first one         |
| `error`        | normalized (see below), `null` otherwise                      |
| `isSubscribed` | the connection is up or coming up — `connecting` or `pending` |
| `restart()`    | close and re-open the same stream, keeping `data`             |

> ⚠️ **`pending` is not TanStack Query's `pending`.** In `useQuery` it means "no
> data yet". Here — as in tRPC — it means **connected**: the server accepted the
> stream and is publishing on it, and `data` may still be `undefined` because
> nothing has been published yet. `if (sub.status === 'pending') return
<Spinner />` renders a spinner _over_ a live stream. Ask `data === undefined`.

The result is a **discriminated union**, so the call site never reaches for `!`:

```tsx
const sub = useSubscription(gqlSubscriptionOptions(OnBatchProgress, { input }));

if (sub.status === 'idle') return null;
if (sub.status === 'error') return <Alert>{sub.error.message}</Alert>; // `error` is Error, not Error | null
if (!sub.data) return <Skeleton />; // connected, nothing published yet

return <Progress value={sub.data.onBulkGenerate.succeededCount} />;
```

`data` is the last payload, not an accumulation: every subscription in this repo
publishes **full snapshots**, which is what makes a dropped stream a non-event —
the next frame corrects the client. For a stream that publishes deltas, keep
your own list from `onData`.

State transitions worth knowing:

| transition                | what happens                                        |
| ------------------------- | --------------------------------------------------- |
| transport connected       | `pending` — before any payload                      |
| connection drops, retries | back to `connecting`, `data` **kept**               |
| variables change          | old stream closed, `data` **cleared**, new one open |
| `restart()`               | same, but `data` is **kept** — same logical stream  |
| `enabled` → false         | stream closed, back to `idle`, `data` cleared       |
| `error` / `complete`      | terminal, and the last `data` stays on screen       |

Clearing on a variables change is not a detail: the previous batch's progress
rendered under the new batch's id is worse than an empty bar. Keeping it across
a retry — or `restart()` — is the same reasoning inverted: a reconnect refills
the bar with the same numbers, so blanking it would be a flicker, not
information.

### The connection, separately

```ts
gqlSubscriptionOptions(OnBatchProgress, {
  input: { batchKey },
  onConnectionStateChange: ({ state, reconnecting }) => {
    if (state === 'connecting' && reconnecting) toast('Reconectando…');
  },
});
```

`{ state: 'idle' | 'connecting' | 'pending', error, reconnecting }`. Three
states only: `error` and `complete` are _results_, not connections — both leave
the connection `idle`, with the terminal error riding along in `error`.

This is real information, not a mirror of `status`. `apps/web`'s SSE client
retries forever (`retryAttempts: Infinity`) precisely so a dropped stream is
invisible to the payload flow — every event is a full snapshot, so the next one
corrects the client. But invisible to the _payload_ flow should not mean
unreportable: without this, a stream that dropped looks exactly like a batch
that stopped making progress. `graphql-sse` reports `connecting` / `connected`
**per subscription** in distinct-connections mode (the mode configured in
`subscribe.ts`), so a retry is attributable to the one stream that dropped.

A transport that reports nothing still works: the first payload is proof enough
of a live stream, so the hook moves to `pending` on it. The same state is never
announced twice, whichever source reported it.

### Errors

Whatever the transport reports comes back as an `Error`, and as the _same_ error
type `execute` throws whenever the payload allows it. `graphql-sse` reports three
different things through one callback: an `Error`, a bare `GraphQLError[]`, or a
close event. The middle one is rebuilt as a `GraphQLResponseError`, which is what
makes `resolveErrorStatus`, `hasCode` and `status` work on a subscription failure
exactly as they do on a query one:

```ts
onError: (error) => {
  if (GraphQLResponseError.is(error) && error.status === 403) { /* … */ }
},
```

A transport that throws synchronously (no transport configured, a malformed
document) lands in `status: 'error'` rather than taking the render down.

### The cache

Every payload is written into Apollo under `ROOT_SUBSCRIPTION` — the dataId
Apollo's own `QueryManager` uses for subscription results. The root field of a
subscription is not a query field and must not be filed as one, but **the
entities nested inside it are the same entities every query holds**, so
normalizing the payload patches them everywhere they are referenced. A
subscription carrying an updated `Case` refreshes every mounted list showing
that case, for free, with no `updateCache` and no invalidation.

That is also the whole benefit, so turn it off when there is none:

```ts
gqlSubscriptionOptions(OnBatchProgress, {
  input: { batchKey },
  // Counters and a batch key — nothing normalizable. Writing it only adds noise.
  writeToCache: false,
});
```

`updateCache` is available too, identical to the mutation option (and running
after the automatic write, so it sees an already-normalized store) for the case
where a payload changes list _membership_ — a stream that announces new rows.

The caveat from **What `updateCache` does not do** applies unchanged: Apollo is
updated, but a mounted `useQuery` is not re-run. Invalidate from `onData` when
the current view has to move:

```ts
onData: () => queryClient.invalidateQueries({ queryKey: ['graph', normalizeQueryKey(LIST.toString())] }),
```

### Transports

The third `GqlRpc` argument is any function shaped like

```ts
(
  document,
  variables,
  {
    next,
    error?,
    complete?,
    // Optional on both sides. Named after `graphql-sse`'s and `graphql-ws`'s
    // own listeners, which report exactly this per subscription — so wiring
    // one is a pass-through, not a translation.
    connecting?: (reconnecting: boolean) => void,
    connected?: (reconnected: boolean) => void,
  },
) => (() => void) | { unsubscribe(): void }
```

Both return shapes are accepted, so `graphql-sse` and `graphql-ws` (bare
function) and anything RxJS-shaped (object) drop in unchanged. A transport that
reports no connection events is fully supported — it just never leaves
`connecting` until the first payload. Opening a stream with no transport
configured throws by name rather than failing silently.

### Gotchas

| Gotcha                                                                        | Why                                                                                                                                  |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| The stream re-opens when the **variables** change, not when the callbacks do. | Callbacks are read from a ref at subscribe time, so an inline `onData` arrow does not tear the stream down on every parent render.   |
| Gating a mutation on `pending` needs a transport that reports `connected`.    | Otherwise `pending` only arrives with the first payload, and the stream waits for the mutation it is holding back. See **Ordering**. |
| A subscription payload is **not** in the TanStack Query cache.                | It lives in the hook. The key exists to decide when to re-subscribe — and is shaped so the query/mutation mirrors ignore it.         |
| `status: 'complete'` is terminal, `restart()` is how you go again.            | The server ended the stream; `graphql-sse`'s own retry does not apply.                                                               |
| Two components subscribing to the same document open **two** streams.         | Same as Apollo and tRPC — there is no dedup. Subscribe once, high enough in the tree, and pass the data down.                        |

## `possibleTypes`

Without it Apollo cannot tell that `Heir` and `JudgmentCreditor` both satisfy a
fragment on `Person`, so reads through an interface or union miss. Generate it
with the `fragment-matcher` codegen plugin:

```ts
'./src/graphql/__gen__/possible-types.json': {
  plugins: ['fragment-matcher'],
  config: { useExplicitTyping: true, federation: true },
},
```

## `__typename`

Apollo keys entities on `__typename` + `id`. Codegen documents don't carry it,
so `toRequestString` parses the document, runs Apollo's
`addTypenameToDocument`, and prints it back — memoized per document object.

Note the _cache key_ uses the document **without** `__typename` while the wire
request uses the one **with** it. That is intentional and consistent:
`InMemoryCache.writeQuery` re-adds `__typename` itself before matching, so both
sides agree.

## Fragment masking

`useInfiniteFragment` is codegen's `useFragment` for data TanStack wrapped in
`InfiniteData`. Like its counterpart it is a compile-time cast, not a hook —
masked refs and the real fragment shape are the same object at runtime.

## Tests

```sh
pnpm nx test tanstack-query-graphql
```

| Spec                                      | Covers                                                                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `gql-rpc.spec.tsx`                        | option builders, key shape, normalization                                                                                     |
| `subscriptions/use-subscription.spec.tsx` | the generic hook, with no GraphQL in the file: lifecycle, `enabled`, connection state, restart, narrowing                     |
| `gql-subscription.spec.tsx`               | the GraphQL half: key shape, variables, `ROOT_SUBSCRIPTION`, `updateCache`, `GraphQLResponseError` — and that the two compose |
| `cache/update-cache.spec.tsx`             | `updateCache` wiring + the Apollo recipes, end to end through a QueryClient                                                   |
| `cache/graph-query-cache.spec.ts`         | query mirroring, hydration, eviction                                                                                          |
| `cache/graph-mutation-cache.spec.ts`      | mutation auto-write into Apollo                                                                                               |
| `request-string.spec.ts`                  | `__typename` injection and key normalization                                                                                  |

`cache/update-cache.spec.tsx` doubles as the executable version of the section
above — including the two behaviours that are easy to regress into: that an
already-mounted query is _not_ refreshed, and that a field-only update needs no
`updateCache` at all.
