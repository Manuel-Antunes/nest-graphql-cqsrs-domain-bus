import { randomUUID } from 'node:crypto';
import type { InjectableOptions } from '@nestjs/common';
import { Injectable } from '@nestjs/common';

import 'reflect-metadata';

import type { ISubscription } from '../interfaces/subscription.interface';
import {
  SUBSCRIPTION_HANDLER_METADATA,
  SUBSCRIPTION_METADATA,
} from './constants';

/**
 * Marks the class as a subscription's handler — the `@QueryHandler` of subscriptions, with the same
 * two-ended mechanics:
 *
 * - on the **subscription class**, it stores an `id` (once only, `hasOwnMetadata`): the identity that
 *   survives identical names in different modules, and what the bus routes by;
 * - on the **handler class**, it stores the subscription it handles: what the
 *   `SubscriptionExplorerService` scans the providers for at bootstrap.
 *
 * The decorated class must implement `ISubscriptionHandler` — that is, have a `subscribe` returning an
 * `Observable`.
 *
 * @param subscription The subscription *class* handled by this handler.
 * @param options Options forwarded to `@Injectable` (scope, for instance).
 */
export const SubscriptionHandler = (
  subscription: ISubscription,
  options?: InjectableOptions,
): ClassDecorator => {
  return (target) => {
    if (
      !Reflect.hasOwnMetadata(SUBSCRIPTION_METADATA, subscription as object)
    ) {
      Reflect.defineMetadata(
        SUBSCRIPTION_METADATA,
        { id: randomUUID() },
        subscription as object,
      );
    }
    Reflect.defineMetadata(SUBSCRIPTION_HANDLER_METADATA, subscription, target);
    if (options) {
      Injectable(options)(target);
    }
  };
};
