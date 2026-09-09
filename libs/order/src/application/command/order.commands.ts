import { Command } from '@nestjs/cqrs';
import type { Order } from '../../domain/order';

/**
 * Os cinco commands do fluxo. Dois rodam na API, dois no serviço de pagamentos, e o quinto (`fail`)
 * na API — mas nenhum deles sabe disso: quem decide onde cada um roda é a fila para a qual o
 * `EnqueueCommand` o mandou.
 */

/** API. Cria (ou reencontra) o pedido da chave. Idempotente pela chave. */
export class PlaceOrderCommand extends Command<Order> {
  constructor(
    readonly key: string,
    readonly orderId: string,
    readonly amount: number,
    readonly customer: string,
  ) {
    super();
  }
}

/** Pagamentos. Pede autorização ao "adquirente". */
export class AuthorizePaymentCommand extends Command<void> {
  constructor(
    readonly key: string,
    readonly orderId: string,
    readonly amount: number,
  ) {
    super();
  }
}

/** Pagamentos. Transforma a reserva em cobrança. */
export class CapturePaymentCommand extends Command<void> {
  constructor(readonly key: string) {
    super();
  }
}

/** API. Fecha o pedido com o comprovante. */
export class CompleteOrderCommand extends Command<void> {
  constructor(
    readonly key: string,
    readonly receiptId: string,
  ) {
    super();
  }
}

/** API. Encerra o pedido pelo caminho triste. */
export class FailOrderCommand extends Command<void> {
  constructor(
    readonly key: string,
    readonly reason: string,
  ) {
    super();
  }
}
