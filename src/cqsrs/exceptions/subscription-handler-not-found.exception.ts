/** A subscription was requested that no `@SubscriptionHandler`-annotated provider handles. */
export class SubscriptionHandlerNotFoundException extends Error {
  constructor(subscriptionName: string) {
    super(`No handler found for the subscription: "${subscriptionName}"`);
  }
}
