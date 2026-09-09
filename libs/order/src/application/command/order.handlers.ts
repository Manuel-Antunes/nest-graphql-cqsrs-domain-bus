import { Logger } from '@nestjs/common';
import { CommandHandler, EventPublisher, type ICommandHandler } from '@nestjs/cqrs';
import { Order } from '../../domain/order';
import { OrderRepository, PaymentRepository } from '../../domain/order.repository';
import { Payment } from '../../domain/payment';
import {
  AuthorizePaymentCommand,
  CapturePaymentCommand,
  CompleteOrderCommand,
  FailOrderCommand,
  PlaceOrderCommand,
} from './order.commands';

/**
 * Os handlers do fluxo. Todos seguem a mesma forma do resto do projeto: carregam (ou criam) o
 * agregado, deixam **o domínio decidir**, salvam, e só então `commit()` — publicar depois de gravar.
 *
 * O `EventPublisher.mergeObjectContext` é o que liga o `commit()` do agregado ao `EventBus` local. E
 * é o `EventBus` local que, pelo `TransportEventBus`, difunde o evento pelos transportes que **a
 * classe dele** declarou — sem que nenhum handler daqui saiba que existe um Redis ou um RabbitMQ.
 */

/**
 * **A deduplicação vive aqui, e é uma linha.** Como a chave de idempotência é a identidade do
 * agregado, "já começou?" é uma busca pela chave. O segundo `placeOrder` com a mesma chave devolve
 * o mesmo pedido, não dispara evento nenhum, e portanto não põe a saga para rodar de novo — o
 * cliente que clicou duas vezes é cobrado uma.
 */
@CommandHandler(PlaceOrderCommand)
export class PlaceOrderCommandHandler implements ICommandHandler<PlaceOrderCommand> {
  private readonly logger = new Logger(PlaceOrderCommandHandler.name);

  constructor(
    private readonly orders: OrderRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(command: PlaceOrderCommand): Promise<Order> {
    const existing = await this.orders.find(command.key);
    if (existing) {
      this.logger.log(`order ${command.key} já existe (${existing.status}) — devolvendo o mesmo`);
      return existing;
    }
    const order = this.publisher.mergeObjectContext(
      Order.start({ key: command.key, orderId: command.orderId, amount: command.amount, customer: command.customer }),
    );
    await this.orders.save(order);
    order.commit();
    return order;
  }
}

@CommandHandler(AuthorizePaymentCommand)
export class AuthorizePaymentCommandHandler implements ICommandHandler<AuthorizePaymentCommand> {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(command: AuthorizePaymentCommand): Promise<void> {
    if (await this.payments.find(command.key)) {
      return; // a mensagem chegou duas vezes; autorizar de novo seria reservar de novo
    }
    const payment = this.publisher.mergeObjectContext(Payment.authorize(command.key, command.orderId, command.amount));
    await this.payments.save(payment);
    payment.commit();
  }
}

@CommandHandler(CapturePaymentCommand)
export class CapturePaymentCommandHandler implements ICommandHandler<CapturePaymentCommand> {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(command: CapturePaymentCommand): Promise<void> {
    const stored = await this.payments.find(command.key);
    if (!stored) {
      return;
    }
    const payment = this.publisher.mergeObjectContext(stored);
    payment.capture(); // no-op se já capturado
    await this.payments.save(payment);
    payment.commit();
  }
}

@CommandHandler(CompleteOrderCommand)
export class CompleteOrderCommandHandler implements ICommandHandler<CompleteOrderCommand> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(command: CompleteOrderCommand): Promise<void> {
    const stored = await this.orders.find(command.key);
    if (!stored) {
      return;
    }
    const order = this.publisher.mergeObjectContext(stored);
    order.complete(command.receiptId);
    await this.orders.save(order);
    order.commit();
  }
}

@CommandHandler(FailOrderCommand)
export class FailOrderCommandHandler implements ICommandHandler<FailOrderCommand> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(command: FailOrderCommand): Promise<void> {
    const stored = await this.orders.find(command.key);
    if (!stored) {
      return;
    }
    const order = this.publisher.mergeObjectContext(stored);
    order.fail(command.reason);
    await this.orders.save(order);
    order.commit();
  }
}
