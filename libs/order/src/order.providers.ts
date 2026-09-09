import type { Provider } from '@nestjs/common';
import { OrderRepository, InMemoryOrderRepository, InMemoryPaymentRepository, PaymentRepository } from './domain/order.repository';
import { OrderSaga } from './application/order.saga';
import { PaymentProjection } from './application/projection/payment.projection';
import {
  AuthorizePaymentCommandHandler,
  CapturePaymentCommandHandler,
  CompleteOrderCommandHandler,
  FailOrderCommandHandler,
  PlaceOrderCommandHandler,
} from './application/command/order.handlers';
import { OnOrderUpdatedSubscriptionHandler } from './application/subscription/on-order-updated.handler';

/**
 * O que cada serviço registra da lib.
 *
 * Repare no que é igual e no que é diferente: os *commands* são divididos (cada um roda no dono do
 * seu agregado), mas a **saga é a mesma nos dois** — inteira, com as quatro regras. É o
 * `RemoteEventBus` que faz cada regra disparar só onde deve, então dividir a saga seria trabalho
 * inútil, e pior: espalharia o desenho do fluxo por dois arquivos.
 */

/**
 * O serviço da API: cria e encerra pedidos, serve a subscription, e projeta os eventos de pagamento
 * do outro serviço num read model próprio (`Order.payment`).
 */
export const orderApiProviders: Provider[] = [
  PlaceOrderCommandHandler,
  CompleteOrderCommandHandler,
  FailOrderCommandHandler,
  OrderSaga,
  OnOrderUpdatedSubscriptionHandler,
  PaymentProjection,
  { provide: OrderRepository, useClass: InMemoryOrderRepository },
];

/** O serviço de pagamentos: autoriza e captura. */
export const orderPaymentsProviders: Provider[] = [
  AuthorizePaymentCommandHandler,
  CapturePaymentCommandHandler,
  OrderSaga,
  { provide: PaymentRepository, useClass: InMemoryPaymentRepository },
];
