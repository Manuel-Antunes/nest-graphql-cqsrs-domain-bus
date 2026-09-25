import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';

import type {
  SubscriptionHandlers,
  Unsubscribable,
  Unsubscribe,
} from './subscriptions';

/**
 * A codegen document. Every app in this repo generates with the `client` preset
 * in `documentMode: 'string'`, so the concrete type is `TypedDocumentString` —
 * a `String` subclass that also carries the result/variables types. We only need
 * the decoration here, so the lib stays independent of each app's `__gen__`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDocument = DocumentTypeDecoration<any, any>;

export type TypedDocumentString<TResult, TVariables> = DocumentTypeDecoration<
  TResult,
  TVariables
> &
  // biome-ignore lint/complexity/noBannedTypes: codegen's TypedDocumentString is a class that extends String, which the primitive rejects
  String;

/**
 * The app-scoped GraphQL transport handed to `GqlRpc`.
 *
 * Typed loosely on purpose. Each app declares `execute` over its own generated
 * `TypedDocumentString` and its own encoding of "this operation takes no
 * variables" (web/digital-twin use a conditional rest tuple, the extension an
 * optional parameter). A precise generic signature here would reject one or the
 * other. Callers never touch this type — the type safety they care about lives
 * on `GqlRpc`'s methods, which are fully generic over the document.
 */
export type GraphExecutor = <TResult, TVariables>(
  query: TypedDocumentString<TResult, TVariables>,
  ...[variables]: TVariables extends Record<string, never> ? [] : [TVariables]
) => Promise<TResult>;

/**
 * Structural copy of the `FragmentType` codegen emits into every app's
 * `__gen__/fragment-masking.ts`. Identical shape, so an app's `FragmentType`
 * and this one are mutually assignable.
 */
export type FragmentType<TDocumentType extends AnyDocument> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TDocumentType extends DocumentTypeDecoration<infer TType, any>
    ? [TType] extends [{ ' $fragmentName'?: infer TKey }]
      ? TKey extends string
        ? { ' $fragmentRefs'?: { [key in TKey]: TType } }
        : never
      : never
    : never;

/**
 * The app-scoped subscription transport handed to `GqlRpc` — the `execute` of
 * subscriptions, and loose for the same reason (see {@link GraphExecutor}).
 *
 * `variables` is a plain parameter rather than a conditional rest tuple: a
 * subscription without variables is rare, and every transport in the repo
 * already accepts `undefined` there.
 */
export type GraphSubscriber = <TResult, TVariables>(
  query: TypedDocumentString<TResult, TVariables>,
  variables: TVariables,
  handlers: SubscriptionHandlers<TResult>,
) => Unsubscribe | Unsubscribable;
