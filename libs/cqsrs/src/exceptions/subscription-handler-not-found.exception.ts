/** Pediram uma subscription que nenhum provider anotado com `@SubscriptionHandler` trata. */
export class SubscriptionHandlerNotFoundException extends Error {
  constructor(subscriptionName: string) {
    super(`No handler found for the subscription: "${subscriptionName}"`);
  }
}
