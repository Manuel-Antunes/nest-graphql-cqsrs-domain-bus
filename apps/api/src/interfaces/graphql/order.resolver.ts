import {
  OrderKey,
  OrderRepository,
  newOrderId,
  OnOrderUpdatedSubscription,
  PaymentProjection,
  PlaceOrderCommand,
} from '@app/order';
import { subscribeAsAsyncIterable, SubscriptionBus } from '@app/cqsrs';
import { CommandBus } from '@nestjs/cqrs';
import { Args, ID, Mutation, Parent, Query, ResolveField, Resolver, Subscription } from '@nestjs/graphql';
import { OrderUpdateView, OrderView, PaymentView, PlaceOrderInput } from '../../dto/graphql/order.dto';
import { OrderViewMapper } from '../../mapper/order-view.mapper';

/**
 * A borda GraphQL do pedido — e a demonstração de para que serve a chave do cliente.
 *
 * O fluxo que um frontend faz, na ordem:
 *
 * ```graphql
 * # 1. o cliente gera a chave e JÁ assina, antes de o pedido existir
 * subscription { onOrderUpdated(key: "3f2a…") { step detail occurredAt } }
 *
 * # 2. só então dispara a mutation, com a mesma chave
 * mutation { placeOrder(input: { key: "3f2a…", amount: 4990, customer: "manuel" }) { status } }
 * ```
 *
 * Assinar primeiro é possível porque a chave vem do cliente: não há o instante entre "o servidor me
 * deu um id" e "eu consegui assinar" em que os primeiros eventos se perderiam. E como a mesma chave é
 * a identidade do agregado, repetir a mutation é inofensivo.
 *
 * A subscription entrega os quatro passos do fluxo, dois deles disparados no **outro** serviço — o
 * resolver não sabe disso, e nem precisa: quem junta local e remoto é o `EventStream`, dentro do
 * handler da subscription.
 */
@Resolver(() => OrderView)
export class OrderResolver {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly subscriptionBus: SubscriptionBus,
    private readonly orders: OrderRepository,
    private readonly payments: PaymentProjection,
    private readonly viewMapper: OrderViewMapper,
  ) {}

  @Query(() => OrderView, { name: 'order', nullable: true, description: 'O estado de um pedido pela chave' })
  async order(@Args('key', { type: () => ID }) key: string): Promise<OrderView | null> {
    const order = await this.orders.find(OrderKey.parse(key));
    return order ? this.viewMapper.fromOrder(order) : null;
  }

  @Mutation(() => OrderView, {
    name: 'placeOrder',
    description: 'Cria o pedido. Idempotente pela chave: repetir devolve o mesmo pedido.',
  })
  async placeOrder(@Args('input') input: PlaceOrderInput): Promise<OrderView> {
    const order = await this.commandBus.execute(
      new PlaceOrderCommand(OrderKey.parse(input.key), input.orderId ?? newOrderId(), input.amount, input.customer),
    );
    return this.viewMapper.fromOrder(order);
  }

  /**
   * `Order.payment` — o campo que relaciona os dois agregados no schema.
   *
   * O pedido é deste serviço; o pagamento é do outro. Um `@ResolveField` é o lugar certo para essa
   * costura: o `Order` não carrega o pagamento dentro de si (não é dele), e quem pergunta pelo pedido
   * sem pedir `payment` não paga por uma leitura que não usou.
   *
   * `null` enquanto o adquirente não respondeu — que é o estado real de um pedido recém-criado, e não
   * um dado faltando.
   */
  @ResolveField(() => PaymentView, {
    nullable: true,
    description: 'O pagamento deste pedido — projetado dos eventos do serviço de pagamentos',
  })
  payment(@Parent() order: OrderView): PaymentView | null {
    const snapshot = this.payments.find(order.key);
    return snapshot ? this.viewMapper.fromPayment(snapshot) : null;
  }

  @Subscription(() => OrderUpdateView, {
    name: 'onOrderUpdated',
    description: 'Cada passo do pedido desta chave — inclusive os que rodaram no serviço de pagamentos',
    resolve: (payload: OrderUpdateView) => payload,
  })
  onOrderUpdated(@Args('key', { type: () => ID }) key: string): AsyncIterable<OrderUpdateView> {
    return subscribeAsAsyncIterable(
      this.subscriptionBus,
      new OnOrderUpdatedSubscription({ key: OrderKey.parse(key) }),
      (event) => this.viewMapper.fromEvent(event),
    );
  }
}
