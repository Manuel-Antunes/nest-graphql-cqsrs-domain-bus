import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EventBus, type IEvent } from '@nestjs/cqrs';
import type { ClientProxy, Transport } from '@nestjs/microservices';
import { MESSAGING_OPTIONS } from '../constants';
import { EventRegistry } from '../event-registry';
import type { EventTransport, MessagingOptions } from '../messaging-options';
import { excludesLocalBus, transportsOf } from './transport-type.decorator';

/**
 * O barramento de eventos com **escolha de transporte por evento** — a ideia do
 * [nestjs-transport-eventbus](https://github.com/sergey-telpuk/nestjs-transport-eventbus), escrita
 * para a versão do framework que este projeto usa.
 *
 * ```
 *                     ┌─ @TransportType(REDIS) ────► ClientProxy Redis  ─► pub/sub: todos ouvem
 *   evento publicado ─┼─ @TransportType(RMQ) ──────► ClientProxy RMQ    ─► fila: um consumidor, com ack
 *                     └─ (sempre, salvo @ExcludeLocal) ► EventBus.subject$ ─► sagas, handlers, EventStream
 * ```
 *
 * ## O que muda em relação a uma ponte de transporte único
 * Antes havia um `RedisEventBridge`: *todo* evento conhecido ia para o Redis, porque o transporte
 * era uma decisão da infraestrutura. Agora a decisão é **do evento**, declarada na classe dele — e
 * isso não é preciosismo, é a diferença entre "avisar" e "garantir":
 *
 * - um `PaymentAuthorizedEvent` é um aviso. Se um assinante perder, a próxima leitura corrige;
 * - um `PaymentCapturedEvent` moveu dinheiro. Quem precisa dele (um livro-caixa) não pode perder,
 *   e por isso ele também sai por uma fila, com ack.
 *
 * O mesmo evento pode ir para os dois, sob padrões diferentes, e ser consumido por gente diferente
 * de cada lado. Um evento sem `@TransportType` não sai do processo.
 *
 * ## Por que trocar o publisher, e não o barramento
 * O `EventBus` do @nestjs/cqrs delega o *publicar* a um `IEventPublisher`. Trocá-lo é o ponto de
 * extensão desenhado para isto: quem **escuta** continua escutando o mesmo `Subject` de sempre. A
 * troca acontece no bootstrap porque o publisher precisa do `subject$` **do** `EventBus`, e as
 * opções do módulo são construídas antes de o `EventBus` existir.
 *
 * (A lib original resolve isso substituindo o `IEventBus` inteiro por um serviço próprio. Aqui não
 * dá: o `EventBus` da v12 é um `Observable` — sagas, `@EventsHandler` e o `EventStream` se inscrevem
 * *nele*. Substituí-lo cortaria o lado de escuta.)
 */
@Injectable()
export class TransportEventBus implements OnApplicationBootstrap {
  private readonly logger = new Logger(TransportEventBus.name);
  /** transporte → para onde e sob que padrão. */
  private readonly routes = new Map<Transport, EventTransport>();

  constructor(
    @Inject(MESSAGING_OPTIONS) private readonly options: MessagingOptions,
    private readonly eventBus: EventBus,
    private readonly moduleRef: ModuleRef,
    private readonly registry: EventRegistry,
  ) {
    this.registry.register(...this.options.events);
    this.options.eventTransports.forEach((route) => this.routes.set(route.transport, route));
  }

  onApplicationBootstrap(): void {
    const local = this.eventBus.subject$;
    this.eventBus.publisher = { publish: (event: IEvent) => this.dispatch(event, local) };
    this.logger.log(
      `${this.options.service}: ${this.routes.size} transporte(s) de evento, ${this.registry.known.length} evento(s) conhecido(s)`,
    );
  }

  /** O caminho de todo evento publicado neste processo. */
  private dispatch(event: IEvent, local: { next: (event: IEvent) => void }): void {
    for (const transport of transportsOf(event as object)) {
      this.broadcast(event, transport);
    }
    if (!excludesLocalBus(event as object)) {
      local.next(event);
    }
  }

  private broadcast(event: IEvent, transport: Transport): void {
    const route = this.routes.get(transport);
    if (!route) {
      this.logger.warn(`evento pede o transporte ${transport}, que este serviço não configurou`);
      return;
    }
    const client = this.moduleRef.get<ClientProxy>(route.client, { strict: false });
    client
      .emit(route.pattern, this.registry.envelope(event, this.options.service))
      .subscribe({ error: (error) => this.logger.error(`falhou difundir por ${route.pattern}`, error) });
  }
}
