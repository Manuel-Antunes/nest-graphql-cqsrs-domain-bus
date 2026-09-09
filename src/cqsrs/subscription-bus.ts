import { Inject, Injectable, Logger, Optional, type Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { AsyncContext } from '@nestjs/cqrs';
import { defer, filter, finalize, mergeMap, type Observable, share, Subject } from 'rxjs';
import type { Subscription } from './classes/subscription';
import { CQSRS_MODULE_OPTIONS } from './constants';
import { SUBSCRIPTION_HANDLER_METADATA, SUBSCRIPTION_METADATA } from './decorators/constants';
import { InvalidSubscriptionHandlerException, SubscriptionHandlerNotFoundException } from './exceptions';
import { DefaultSubscriptionPubSub } from './helpers/default-subscription-pubsub';
import { subscriptionKey } from './helpers/subscription-key';
import type {
  CqsrsModuleOptions,
  ISubscription,
  ISubscriptionBus,
  ISubscriptionHandler,
  ISubscriptionPublisher,
  SubscriptionMetadata,
} from './interfaces';

export type SubscriptionHandlerType<
  SubscriptionBase extends ISubscription = ISubscription,
  TEvent = any,
> = Type<ISubscriptionHandler<SubscriptionBase, TEvent>>;

/** Um handler já resolvido do container e pronto para abrir o stream de uma subscription. */
type BoundSubscriptionHandler = (subscription: any, asyncContext?: AsyncContext) => Observable<any>;

/**
 * O bus das subscriptions: **`subscribe` no lugar de `execute`**.
 *
 * É o irmão do `QueryBus` do @nestjs/cqrs, com a mesma anatomia — um `Map` de handlers por id de
 * mensagem, um publisher, e ele mesmo um `ObservableBus` do que passou por ele — e uma diferença de
 * natureza: uma query resolve uma `Promise` e morre; uma subscription devolve um `Observable` que
 * fica aberto. Modelar isso como query funcionava por acidente (`await` de um `Observable`, que não
 * é *thenable*, devolve o próprio `Observable`); aqui é o contrato.
 *
 * ## O que o bus faz, e que o handler não precisa fazer
 * O handler só liga a mensagem à fonte (`eventBus.pipe(ofType(PostUpdatedEvent))`). O bus faz o
 * resto, igual para toda subscription:
 *
 * 1. **acha o handler** pelo id que o `@SubscriptionHandler` gravou na classe da subscription;
 * 2. **aplica o filtro da própria mensagem** (`subscription.filter(event)`) sobre o stream — uma vez
 *    por stream, não por assinante;
 * 3. **compartilha por chave** (ver abaixo);
 * 4. **desliga sozinho**: quando o último assinante cancela, o `share({ resetOnRefCountZero: true })`
 *    cancela a inscrição na fonte. Ninguém fica pendurado no `EventBus`.
 *
 * ## O filtro é a chave
 * A chave de um stream é `id da subscription + critério serializado` — {@link Subscription.key}.
 * Dois assinantes que pedem `onPostUpdated(postId: X)` pedem *a mesma coisa*: recebem o mesmo
 * `Observable`, e o `EventBus` enxerga um assinante só, com o filtro rodando uma vez para os dois.
 * Pedir `postId: Y` é outra chave, outro stream, outra inscrição.
 *
 * O `Map` de streams é a única coisa que o `QueryBus` não tem — e é o que a palavra "subscription"
 * pede: uma query é sem estado porque não sobra nada dela; um stream aberto é justamente o que sobra.
 * O mapa se mantém sozinho: o `finalize` tira a entrada quando o stream morre, e o `defer` a repõe se
 * alguém reassinar o mesmo `Observable` depois. O que está no mapa é sempre o que está no ar.
 *
 * ## Por que este bus não é um `ObservableBus`
 * `CommandBus`, `QueryBus` e `EventBus` *são* `Observable`s das mensagens que passam por eles. Este
 * não pode ser: `ObservableBus` estende `Observable`, e `Observable` já tem um método `subscribe` —
 * que quer dizer outra coisa ("me avise das mensagens que passarem por este bus"). Duas coisas
 * diferentes não cabem no mesmo nome, e `subscribe(subscription)` é o método que dá sentido ao bus.
 * O `Subject` continua aqui, exposto como {@link SubscriptionBus.subscriptions$}: quem quiser
 * observar quem pediu o quê tem o mesmo stream, com um nome que não mente.
 */
@Injectable()
export class SubscriptionBus<SubscriptionBase extends ISubscription = ISubscription>
  implements ISubscriptionBus<SubscriptionBase>
{
  private readonly logger = new Logger(SubscriptionBus.name);
  private readonly subject$ = new Subject<SubscriptionBase>();
  /** id da subscription → handler resolvido. */
  private readonly handlers = new Map<string, BoundSubscriptionHandler>();
  /** chave (id + critério) → o stream compartilhado que está no ar para ela. */
  private readonly streams = new Map<string, Observable<any>>();
  private _publisher: ISubscriptionPublisher<SubscriptionBase>;

  constructor(
    private readonly moduleRef: ModuleRef,
    @Optional() @Inject(CQSRS_MODULE_OPTIONS) private readonly options?: CqsrsModuleOptions,
  ) {
    if (this.options?.subscriptionPublisher) {
      this._publisher = this.options.subscriptionPublisher as ISubscriptionPublisher<SubscriptionBase>;
    } else {
      this.useDefaultPublisher();
    }
  }

  /**
   * Cada subscription pedida a este bus, na ordem em que foi pedida — o que o `QueryBus` entrega
   * sendo ele mesmo um `Observable`. Serve para instrumentar: quem assinou o quê, quantas vezes.
   */
  get subscriptions$(): Observable<SubscriptionBase> {
    return this.subject$.asObservable();
  }

  /** O publisher para onde cada subscription pedida é anunciada. */
  get publisher(): ISubscriptionPublisher<SubscriptionBase> {
    return this._publisher;
  }

  /**
   * Troca o publisher. O padrão é o `DefaultSubscriptionPubSub` (em memória).
   * @param _publisher O publisher.
   */
  set publisher(_publisher: ISubscriptionPublisher<SubscriptionBase>) {
    this._publisher = _publisher;
  }

  /**
   * Abre (ou reaproveita) o stream de uma subscription.
   * @param subscription A subscription, com o critério de quem pede.
   */
  subscribe<TEvent>(subscription: Subscription<TEvent, any>): Observable<TEvent>;
  /**
   * Abre (ou reaproveita) o stream de uma subscription.
   * @param subscription A subscription, com o critério de quem pede.
   */
  subscribe<T extends SubscriptionBase, TEvent = any>(subscription: T): Observable<TEvent>;
  /**
   * Abre (ou reaproveita) o stream de uma subscription.
   * @param subscription A subscription, com o critério de quem pede.
   * @param asyncContext O contexto de um handler request-scoped.
   */
  subscribe<TEvent>(subscription: Subscription<TEvent, any>, asyncContext: AsyncContext): Observable<TEvent>;
  /**
   * Abre (ou reaproveita) o stream de uma subscription.
   * @param subscription A subscription, com o critério de quem pede.
   * @param asyncContext O contexto de um handler request-scoped.
   */
  subscribe<T extends SubscriptionBase, TEvent = any>(subscription: T, asyncContext: AsyncContext): Observable<TEvent>;
  subscribe<TEvent>(subscription: Subscription<TEvent, any>, asyncContext?: AsyncContext): Observable<TEvent> {
    const subscriptionId = this.getSubscriptionId(subscription);
    const handler = this.handlers.get(subscriptionId);
    if (!handler) {
      throw new SubscriptionHandlerNotFoundException(this.getSubscriptionName(subscription));
    }
    this._publisher.publish(subscription as unknown as SubscriptionBase);

    const key = `${subscriptionId}:${this.getStreamKey(subscription)}`;
    const alreadyOpen = this.streams.get(key) as Observable<TEvent> | undefined;
    if (alreadyOpen) {
      return alreadyOpen;
    }

    /**
     * `defer` porque a fonte só deve ser tocada quando alguém de fato assinar — e de novo, do zero,
     * se o stream tiver sido desligado por falta de assinantes e alguém voltar a assinar *este mesmo*
     * `Observable`. É nesse segundo caso que a entrada do mapa precisa voltar.
     */
    const stream: Observable<TEvent> = defer(() => {
      this.streams.set(key, stream);
      return handler(subscription, asyncContext) as Observable<TEvent>;
    }).pipe(
      // O filtro da mensagem, antes do `share`: roda uma vez por stream, e não uma vez por assinante.
      filter((event) => subscription.match?.(event) ?? true),
      // Depois do `share` isto rodaria a cada assinante que sai; aqui roda quando o stream morre.
      finalize(() => {
        if (this.streams.get(key) === stream) {
          this.streams.delete(key);
        }
      }),
      share({ resetOnRefCountZero: true }),
    );
    this.streams.set(key, stream);
    return stream;
  }

  /**
   * Liga um handler ao id de uma subscription. Mesma bifurcação do `QueryBus.bind`: com árvore de
   * dependências estática a instância é única e resolvida no bootstrap; senão ela é resolvida a cada
   * assinatura, dentro do `defer`, no contexto daquele pedido.
   */
  bind<T extends SubscriptionBase, TEvent = any>(
    handler: InstanceWrapper<ISubscriptionHandler<T, TEvent>>,
    subscriptionId: string,
  ): void {
    if (handler.isDependencyTreeStatic()) {
      const instance = handler.instance as { subscribe?: (subscription: T) => Observable<TEvent> };
      if (!instance?.subscribe) {
        throw new InvalidSubscriptionHandlerException();
      }
      this.handlers.set(subscriptionId, (subscription) => instance.subscribe!(subscription as T));
      return;
    }
    this.handlers.set(subscriptionId, (subscription, context) =>
      defer(() => {
        const asyncContext = context ?? AsyncContext.of(subscription as object) ?? new AsyncContext();
        this.moduleRef.registerRequestByContextId(asyncContext, asyncContext.id);
        return this.moduleRef.resolve<{ subscribe: (subscription: T) => Observable<TEvent> }>(
          handler.metatype as Type,
          asyncContext.id,
          { strict: false },
        );
      }).pipe(mergeMap((instance) => instance.subscribe(subscription as T))),
    );
  }

  register(handlers: InstanceWrapper<ISubscriptionHandler<any>>[] = []): void {
    handlers.forEach((handler) => this.registerHandler(handler));
  }

  protected registerHandler(handler: InstanceWrapper<ISubscriptionHandler<any>>): void {
    const typeRef = (handler.inject ? handler.instance?.constructor : handler.metatype) as Type;
    const target = this.reflectSubscriptionId(typeRef);
    if (!target) {
      throw new InvalidSubscriptionHandlerException();
    }
    if (this.handlers.has(target)) {
      this.logger.warn(
        `Subscription handler [${typeRef.name}] is already registered. Overriding previously registered handler.`,
      );
    }
    this.bind(handler as InstanceWrapper<ISubscriptionHandler<SubscriptionBase>>, target);
  }

  /** O id que o `@SubscriptionHandler` gravou na classe da subscription. */
  private getSubscriptionId(subscription: ISubscription): string {
    const { constructor: subscriptionType } = Object.getPrototypeOf(subscription);
    const metadata: SubscriptionMetadata | undefined = Reflect.getMetadata(SUBSCRIPTION_METADATA, subscriptionType);
    if (!metadata) {
      throw new SubscriptionHandlerNotFoundException(subscriptionType.name);
    }
    return metadata.id;
  }

  private reflectSubscriptionId(handler: Type): string | undefined {
    const subscription = Reflect.getMetadata(SUBSCRIPTION_HANDLER_METADATA, handler);
    const metadata: SubscriptionMetadata | undefined =
      subscription && Reflect.getMetadata(SUBSCRIPTION_METADATA, subscription);
    return metadata?.id;
  }

  /**
   * A parte da chave que vem do critério. Uma `Subscription` já sabe a sua ({@link Subscription.key});
   * uma mensagem que só implementa `ISubscription` cai no critério serializado — e, sem critério
   * nenhum, todas as instâncias dela compartilham um stream só.
   */
  private getStreamKey(subscription: Subscription<unknown, any>): string {
    return subscription.key ?? subscriptionKey((subscription as { criteria?: unknown }).criteria);
  }

  private getSubscriptionName(subscription: ISubscription): string {
    const { constructor } = Object.getPrototypeOf(subscription);
    return constructor.name;
  }

  private useDefaultPublisher(): void {
    this._publisher = new DefaultSubscriptionPubSub<SubscriptionBase>(this.subject$);
  }
}
