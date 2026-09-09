import { EventStream } from '@app/cqsrs';
import { Injectable, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { filter, type Subscription } from 'rxjs';
import { PaymentAuthorizedEvent, PaymentCapturedEvent, PaymentDeclinedEvent } from '../../domain/event/order-event';
import { PaymentStatus } from '../../domain/payment';

/** Um evento do pagamento, seja qual for o desfecho. */
type PaymentEvent = PaymentAuthorizedEvent | PaymentDeclinedEvent | PaymentCapturedEvent;

const isPaymentEvent = (event: unknown): event is PaymentEvent =>
  event instanceof PaymentAuthorizedEvent ||
  event instanceof PaymentDeclinedEvent ||
  event instanceof PaymentCapturedEvent;

/** O pagamento como o serviço da API o conhece: o que veio nos eventos, nada mais. */
export interface PaymentSnapshot {
  readonly orderKey: string;
  readonly orderId: string;
  readonly status: PaymentStatus;
  readonly amount: number;
  readonly authorizationId?: string;
  readonly receiptId?: string;
  readonly reason?: string;
  readonly updatedAt: Date;
}

/**
 * O read model do pagamento, no serviço da API — e a resposta para "como o `Order` mostra dados de um
 * agregado que vive em **outro** serviço".
 *
 * A API não tem o agregado `Payment`: ele é do serviço de pagamentos, que é quem decide autorizar e
 * capturar. O que a API tem são os **eventos** que aquele serviço publicou. Então ela faz o que o
 * lado de leitura do CQRS sempre fez: projeta os eventos num modelo próprio, moldado para a pergunta
 * que ela precisa responder — aqui, `Order.payment`.
 *
 * ## Por que o `EventStream`, e não o `EventBus`
 * Os três eventos que alimentam esta projeção acontecem no **outro** processo e chegam pelo Redis,
 * ou seja, pelo `RemoteEventBus`. Um `@EventsHandler` não os veria: ele escuta o `EventBus`, que é
 * só o que aconteceu aqui.
 *
 * O `EventStream` (local + remoto) é a fonte certa — e repare que é *a mesma* fonte da subscription
 * `onOrderUpdated`. Não é coincidência: as duas são leitura. Uma entrega o passo ao cliente na hora,
 * a outra acumula o estado para quem perguntar depois; ambas precisam ver o fluxo inteiro, venha de
 * onde vier. O `EventStream` existe exatamente para esse par de consumidores.
 *
 * ## Em memória, e por quê
 * Um `Map` por processo, como os repositórios da POC. Numa aplicação de verdade isto seria uma
 * tabela — e a única coisa que mudaria seria o `Map`: a projeção continuaria sendo "para cada evento,
 * atualize a linha da chave".
 */
@Injectable()
export class PaymentProjection implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly byOrderKey = new Map<string, PaymentSnapshot>();
  private subscription?: Subscription;

  constructor(private readonly events: EventStream) {}

  onApplicationBootstrap(): void {
    this.subscription = this.events.pipe(filter(isPaymentEvent)).subscribe((event) => this.apply(event));
  }

  onModuleDestroy(): void {
    this.subscription?.unsubscribe();
  }

  /** O pagamento de um pedido, ou `undefined` enquanto o adquirente não respondeu. */
  find(orderKey: string): PaymentSnapshot | undefined {
    return this.byOrderKey.get(orderKey);
  }

  /**
   * Cada evento traz o estado resultante, não um delta — a mesma disciplina dos `on<Evento>` dos
   * agregados. A captura preserva o `authorizationId` porque ele é do passo anterior e continua
   * verdadeiro: é a única informação que o evento de captura não repete.
   */
  private apply(event: PaymentEvent): void {
    const current = this.byOrderKey.get(event.key);
    const base = { orderKey: event.key, orderId: event.orderId, updatedAt: event.occurredAt };

    if (event instanceof PaymentAuthorizedEvent) {
      this.byOrderKey.set(event.key, {
        ...base,
        status: PaymentStatus.AUTHORIZED,
        amount: event.amount,
        authorizationId: event.authorizationId,
      });
      return;
    }
    if (event instanceof PaymentDeclinedEvent) {
      this.byOrderKey.set(event.key, {
        ...base,
        status: PaymentStatus.DECLINED,
        amount: event.amount,
        reason: event.reason,
      });
      return;
    }
    this.byOrderKey.set(event.key, {
      ...base,
      status: PaymentStatus.CAPTURED,
      amount: event.amount,
      authorizationId: current?.authorizationId,
      receiptId: event.receiptId,
    });
  }
}
