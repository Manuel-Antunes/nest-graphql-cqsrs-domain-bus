import type { Type } from '@nestjs/common';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { Injectable } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core/injector/modules-container';

import 'reflect-metadata';

import type { ISubscriptionHandler } from '../interfaces/subscription-handler.interface';
import { SUBSCRIPTION_HANDLER_METADATA } from '../decorators/constants';

/**
 * Scans every module's providers for those annotated with `@SubscriptionHandler` — the same role
 * @nestjs/cqrs's `ExplorerService` plays for commands, queries, events and sagas, through the same
 * mechanics (class metadata). Runs once, in `CqsrsModule`'s `onApplicationBootstrap`.
 *
 * Returns `InstanceWrapper`s rather than instances, because it is the wrapper that knows whether the
 * handler is static or request-scoped — the distinction `SubscriptionBus.bind` has to make.
 */
@Injectable()
export class SubscriptionExplorerService {
  constructor(private readonly modulesContainer: ModulesContainer) {}

  explore(): InstanceWrapper<ISubscriptionHandler>[] {
    return [...this.modulesContainer.values()]
      .flatMap((moduleRef) => [...moduleRef.providers.values()])
      .filter((wrapper) => {
        /** `wrapper.inject` (a factory provider) already has an instance; the rest have `metatype`. */
        const classRef = (wrapper.instance?.constructor ?? wrapper.metatype) as
          Type | null | undefined;
        return (
          !!classRef &&
          !!Reflect.getMetadata(SUBSCRIPTION_HANDLER_METADATA, classRef)
        );
      }) as InstanceWrapper<ISubscriptionHandler>[];
  }
}
