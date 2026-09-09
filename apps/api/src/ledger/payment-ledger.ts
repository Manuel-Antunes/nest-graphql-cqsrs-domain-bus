import { Injectable, Logger } from '@nestjs/common';
import type { PaymentCapturedEvent } from '@app/order';

/** Uma linha do livro-caixa: dinheiro que entrou, e por conta de qual pedido. */
export interface LedgerEntry {
  readonly orderKey: string;
  readonly orderId: string;
  readonly receiptId: string;
  readonly amount: number;
  readonly at: Date;
}

/**
 * O livro-caixa: a razão de existir do transporte **durável**.
 *
 * Ele é o contraste que justifica o `@TransportType(Transport.REDIS, Transport.RMQ)` no
 * `PaymentCapturedEvent`. A subscription e a projeção do pagamento vivem bem com difusão: se uma
 * notificação se perder, a próxima leitura corrige. Um livro-caixa, não — uma captura que não for
 * registrada é dinheiro que entrou e ninguém contabilizou, e nenhuma releitura conserta isso.
 *
 * Por isso ele não escuta o `EventStream` (que é alimentado por difusão, sem garantia), e sim uma
 * **fila**, com ack: se este processo cair antes de registrar, a mensagem volta.
 *
 * O `record` é idempotente pelo comprovante porque uma fila entrega *ao menos* uma vez, e a mesma
 * captura pode chegar duas vezes.
 */
@Injectable()
export class PaymentLedger {
  private readonly logger = new Logger(PaymentLedger.name);
  private readonly byReceipt = new Map<string, LedgerEntry>();

  record(event: PaymentCapturedEvent): void {
    if (this.byReceipt.has(event.receiptId)) {
      return; // a fila entregou de novo; contabilizar duas vezes seria pior que ignorar
    }
    this.byReceipt.set(event.receiptId, {
      orderKey: event.key,
      orderId: event.orderId,
      receiptId: event.receiptId,
      amount: event.amount,
      at: event.occurredAt,
    });
    this.logger.log(`livro-caixa: +${event.amount} (pedido ${event.orderId}, comprovante ${event.receiptId})`);
  }

  find(orderKey: string): LedgerEntry | undefined {
    return [...this.byReceipt.values()].find((entry) => entry.orderKey === orderKey);
  }

  get entries(): LedgerEntry[] {
    return [...this.byReceipt.values()];
  }

  get total(): number {
    return this.entries.reduce((sum, entry) => sum + entry.amount, 0);
  }
}
