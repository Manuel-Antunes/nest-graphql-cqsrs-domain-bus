/**
 * CQSRS — Command, Query, **Subscription** Responsibility Segregation.
 *
 * The third CQRS message, with the same pieces @nestjs/cqrs gives the other two:
 *
 * | | message | decorator | handler contract | bus | result |
 * |---|---|---|---|---|---|
 * | command | `Command<T>` | `@CommandHandler` | `execute` | `CommandBus` | `Promise<T>` |
 * | query | `Query<T>` | `@QueryHandler` | `execute` | `QueryBus` | `Promise<T>` |
 * | **subscription** | **`Subscription<TEvent, TCriteria>`** | **`@SubscriptionHandler`** | **`subscribe`** | **`SubscriptionBus`** | **`Observable<TEvent>`** |
 *
 * Everything subscription-specific lives here, and nothing here knows what GraphQL is: the package
 * speaks RxJS on one side and async iterables on the other.
 */
export * from './classes';
export * from './constants';
export * from './cqsrs.module';
export * from './decorators';
export * from './exceptions';
export * from './helpers';
export * from './interfaces';
export * from './services/subscription-explorer.service';
export * from './subscription-bus';
