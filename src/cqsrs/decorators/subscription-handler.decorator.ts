import { Injectable, type InjectableOptions } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import 'reflect-metadata';
import type { ISubscription } from '../interfaces/subscription.interface';
import { SUBSCRIPTION_HANDLER_METADATA, SUBSCRIPTION_METADATA } from './constants';

/**
 * Marca a classe como o handler de uma subscription — o `@QueryHandler` das subscriptions, com a
 * mesma mecânica de duas pontas:
 *
 * - na **classe da subscription**, grava um `id` (uma vez só, `hasOwnMetadata`): é a identidade que
 *   sobrevive a nomes iguais em módulos diferentes, e é por ela que o bus faz o roteamento;
 * - na **classe do handler**, grava a subscription que ele trata: é o que o
 *   `SubscriptionExplorerService` varre nos providers no bootstrap.
 *
 * A classe decorada precisa implementar `ISubscriptionHandler` — ou seja, ter um `subscribe` que
 * devolve um `Observable`.
 *
 * @param subscription A *classe* da subscription tratada por este handler.
 * @param options Opções repassadas ao `@Injectable` (escopo, por exemplo).
 */
export const SubscriptionHandler = (subscription: ISubscription, options?: InjectableOptions): ClassDecorator => {
  return (target) => {
    if (!Reflect.hasOwnMetadata(SUBSCRIPTION_METADATA, subscription as object)) {
      Reflect.defineMetadata(SUBSCRIPTION_METADATA, { id: randomUUID() }, subscription as object);
    }
    Reflect.defineMetadata(SUBSCRIPTION_HANDLER_METADATA, subscription, target);
    if (options) {
      Injectable(options)(target);
    }
  };
};
