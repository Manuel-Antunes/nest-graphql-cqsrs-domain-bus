/** The class is annotated with `@SubscriptionHandler`, but is not a subscription handler. */
export class InvalidSubscriptionHandlerException extends Error {
  constructor() {
    super(
      `An invalid subscription handler has been provided. Please ensure that the provided handler is a class annotated with @SubscriptionHandler and contains a 'subscribe' method that returns an Observable.`,
    );
  }
}
