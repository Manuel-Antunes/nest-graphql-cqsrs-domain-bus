import { OrderStatus, OrderStep, PaymentStatus } from '@app/order';
import { Field, GraphQLISODateTime, ID, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

registerEnumType(OrderStep, { name: 'OrderStep', description: 'Onde o fluxo está' });
registerEnumType(OrderStatus, { name: 'OrderStatus', description: 'Em que estado o pedido parou' });
registerEnumType(PaymentStatus, { name: 'PaymentStatus', description: 'Em que estado o pagamento está' });

/**
 * A entrada do pedido. `key` é a **chave de idempotência gerada pelo cliente** — a mesma que ele
 * usa na subscription `onOrderUpdated`. Mandar duas vezes a mesma chave não cria dois pedidos.
 */
@InputType()
export class PlaceOrderInput {
  @Field(() => ID, { description: 'Chave de idempotência/contexto gerada pelo cliente (UUID)' })
  key: string;

  @Field(() => ID, { nullable: true, description: 'O pedido; gerado aqui se ausente' })
  orderId?: string | null;

  @Field(() => Int, { description: 'Valor em centavos' })
  amount: number;

  @Field()
  customer: string;
}

/** O estado de um pedido — o que a mutation devolve e a query lê. O pagamento vem em `payment`. */
@ObjectType('Order')
export class OrderView {
  @Field(() => ID)
  key: string;

  @Field(() => ID)
  orderId: string;

  @Field(() => Int)
  amount: number;

  @Field()
  customer: string;

  @Field(() => OrderStatus)
  status: OrderStatus;

  @Field(() => String, { nullable: true, description: 'Por que o pedido falhou' })
  reason?: string | null;

  @Field(() => GraphQLISODateTime)
  placedAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  // `payment` não é @Field: é resolvido à parte, pelo OrderResolver, a partir da projeção —
  // o pagamento acontece em outro serviço e chega por evento, não pelo agregado do pedido.
}

/**
 * O pagamento de um pedido, como a API o conhece.
 *
 * Ele é um **agregado de outro serviço**: quem autoriza e captura é o `apps/payments`. O que existe
 * aqui é a projeção dos eventos que aquele serviço publicou — por isso o tipo é nulo enquanto o
 * adquirente não respondeu, e por isso os campos aparecem em passos: `authorizationId` na
 * autorização, `receiptId` na captura, `reason` na recusa.
 */
@ObjectType('Payment')
export class PaymentView {
  @Field(() => PaymentStatus)
  status: PaymentStatus;

  @Field(() => Int, { description: 'Valor em centavos' })
  amount: number;

  @Field(() => ID, { nullable: true, description: 'Da autorização em diante' })
  authorizationId?: string | null;

  @Field(() => ID, { nullable: true, description: 'Da captura em diante' })
  receiptId?: string | null;

  @Field(() => String, { nullable: true, description: 'Por que o adquirente recusou' })
  reason?: string | null;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;
}

/**
 * Um passo do fluxo, como o cliente o vê. É a projeção de um evento de domínio — e o cliente não faz
 * ideia de qual dos dois serviços o disparou, que é exatamente o ponto.
 */
@ObjectType('OrderUpdate')
export class OrderUpdateView {
  @Field(() => ID)
  key: string;

  @Field(() => ID)
  orderId: string;

  @Field(() => OrderStep)
  step: OrderStep;

  @Field(() => String, {
    nullable: true,
    description: 'O que aquele passo trouxe de novo (id de autorização, comprovante, motivo)',
  })
  detail?: string | null;

  @Field(() => GraphQLISODateTime)
  occurredAt: Date;
}
