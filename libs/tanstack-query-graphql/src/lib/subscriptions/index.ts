/**
 * TanStack Query ↔ subscriptions, with no GraphQL in it. See `./types.ts` for
 * why this folder is kept self-contained.
 */

export type {
  ConnectionState,
  SubscriptionCompleteResult,
  SubscriptionConnectingResult,
  SubscriptionErrorResult,
  SubscriptionHandlers,
  SubscriptionIdleResult,
  SubscriptionOptions,
  SubscriptionPendingResult,
  SubscriptionResult,
  SubscriptionStatus,
  Unsubscribable,
  Unsubscribe,
} from './types';
export { toError, toUnsubscribe } from './types';
export { useSubscription } from './use-subscription';
