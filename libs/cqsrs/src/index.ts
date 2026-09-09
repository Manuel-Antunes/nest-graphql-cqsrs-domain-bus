/**
 * CQSRS — Command, Query, **Subscription** Responsibility Segregation.
 *
 * A terceira mensagem do CQRS, com as mesmas peças que o @nestjs/cqrs dá às outras duas:
 *
 * | | mensagem | decorator | contrato do handler | bus | resultado |
 * |---|---|---|---|---|---|
 * | command | `Command<T>` | `@CommandHandler` | `execute` | `CommandBus` | `Promise<T>` |
 * | query | `Query<T>` | `@QueryHandler` | `execute` | `QueryBus` | `Promise<T>` |
 * | **subscription** | **`Subscription<TEvent, TCriteria>`** | **`@SubscriptionHandler`** | **`subscribe`** | **`SubscriptionBus`** | **`Observable<TEvent>`** |
 *
 * Tudo o que é específico das subscriptions mora aqui, e nada aqui sabe o que é GraphQL: o pacote
 * fala RxJS de um lado e async iterable do outro.
 */
export * from './classes';
export * from './constants';
export * from './cqsrs.module';
export * from './decorators';
export * from './event-stream';
export * from './exceptions';
export * from './helpers';
export * from './interfaces';
export * from './remote-event-bus';
export * from './services/subscription-explorer.service';
export * from './subscription-bus';
