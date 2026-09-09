import { Subscription } from '@app/cqsrs';
import type { OrderEvent } from '../../domain/event/order-event';

/** O critério: a chave de idempotência/contexto que o cliente gerou e mandou nas duas pontas. */
export interface OnOrderUpdatedCriteria {
  readonly key: string;
}

/**
 * "Me avise a cada passo **deste** pedido" — a subscription que o frontend abre com a mesma chave
 * que vai mandar na mutation.
 *
 * A chave fecha um ciclo bonito do CQSRS: ela é, ao mesmo tempo,
 *
 * - o **critério** do filtro (só os eventos deste pedido chegam ao assinante),
 * - a **chave de compartilhamento** do stream (duas abas do mesmo pedido custam uma inscrição só),
 * - e a **identidade do agregado** do outro lado (o que deduplica a mutation).
 *
 * Uma coisa, três papéis, porque os três são a mesma pergunta: "de qual pedido estamos falando?".
 *
 * O filtro é obrigatório aqui — sem `key` não há subscription. Escutar "todos os pedidos" seria um
 * vazamento entre clientes, não uma conveniência.
 */
export class OnOrderUpdatedSubscription extends Subscription<OrderEvent, OnOrderUpdatedCriteria> {
  override filter(event: OrderEvent): boolean {
    return event.key === this.criteria.key;
  }
}
