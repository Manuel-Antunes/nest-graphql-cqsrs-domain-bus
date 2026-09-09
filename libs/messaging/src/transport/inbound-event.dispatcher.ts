import { RemoteEventBus } from '@app/cqsrs';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IEvent } from '@nestjs/cqrs';
import { MESSAGING_OPTIONS } from '../constants';
import { type EventEnvelope, EventRegistry } from '../event-registry';
import type { MessagingOptions } from '../messaging-options';

/**
 * A porta de entrada dos eventos que vieram de outro processo.
 *
 * Ela faz três coisas, e a terceira é a que importa para o desenho todo:
 *
 * 1. **descarta o próprio eco** — um transporte de difusão entrega a mensagem a todos os inscritos,
 *    inclusive a quem publicou. Sem isso, cada evento local apareceria duas vezes na subscription;
 * 2. **reconstrói a instância da classe**, para `ofType`/`instanceof` voltarem a funcionar;
 * 3. **entrega no `RemoteEventBus`, e não no `EventBus`** — o que só as subscriptions e as projeções
 *    leem. É o que impede a saga (a mesma classe, na mesma lib, registrada nos dois serviços) de
 *    reagir de novo a um fato que já foi tratado no serviço dono dele.
 */
@Injectable()
export class InboundEventDispatcher {
  private readonly logger = new Logger(InboundEventDispatcher.name);

  constructor(
    @Inject(MESSAGING_OPTIONS) private readonly options: MessagingOptions,
    private readonly registry: EventRegistry,
    private readonly remoteEventBus: RemoteEventBus,
  ) {}

  /**
   * Devolve o evento reconstruído (ou `undefined` se ele não era para este serviço) — quem chama
   * pode querer fazer mais do que notificar, como o consumidor durável faz.
   */
  receive(envelope: EventEnvelope): IEvent | undefined {
    if (envelope?.origin === this.options.service) {
      return undefined; // o nosso próprio eco
    }
    const event = this.registry.restore(envelope);
    if (!event) {
      this.logger.debug(`evento "${envelope?.name}" não é conhecido aqui — ignorado`);
    }
    return event;
  }

  /** Recebe e notifica: o caminho do padrão de *notificação*. */
  notify(envelope: EventEnvelope): void {
    const event = this.receive(envelope);
    if (event) {
      this.remoteEventBus.publish(event);
    }
  }
}
