import { Injectable, type Type } from '@nestjs/common';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { ModulesContainer } from '@nestjs/core/injector/modules-container';
import 'reflect-metadata';
import { SUBSCRIPTION_HANDLER_METADATA } from '../decorators/constants';
import type { ISubscriptionHandler } from '../interfaces/subscription-handler.interface';

/**
 * Varre os providers de todos os módulos atrás dos anotados com `@SubscriptionHandler` — o mesmo
 * papel que o `ExplorerService` do @nestjs/cqrs cumpre para commands, queries, events e sagas, e
 * pela mesma mecânica (a metadata na classe). Roda uma vez, no `onApplicationBootstrap` do
 * `CqsrsModule`.
 *
 * Devolve `InstanceWrapper`s, e não instâncias, porque é o wrapper que sabe se o handler é estático
 * ou request-scoped — a diferença que o `SubscriptionBus.bind` precisa fazer.
 */
@Injectable()
export class SubscriptionExplorerService {
  constructor(private readonly modulesContainer: ModulesContainer) {}

  explore(): InstanceWrapper<ISubscriptionHandler>[] {
    return [...this.modulesContainer.values()]
      .flatMap((moduleRef) => [...moduleRef.providers.values()])
      .filter((wrapper) => {
        /** `wrapper.inject` (factory provider) já tem instância; os demais têm `metatype`. */
        const classRef = (wrapper.instance?.constructor ?? wrapper.metatype) as Type | null | undefined;
        return !!classRef && !!Reflect.getMetadata(SUBSCRIPTION_HANDLER_METADATA, classRef);
      }) as InstanceWrapper<ISubscriptionHandler>[];
  }
}
