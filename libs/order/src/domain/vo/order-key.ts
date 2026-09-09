import { randomUUID } from 'node:crypto';
import { z } from 'zod';

/**
 * A **chave de idempotência/contexto** de um pedido — gerada pelo *cliente*, não pelo servidor, e
 * enviada nas duas pontas: na mutation `placeOrder` e na subscription `onOrderUpdated`.
 *
 * É o que torna o fluxo utilizável de verdade por um frontend, e resolve dois problemas com um valor
 * só:
 *
 * - **deduplicação.** Um clique duplo, um retry de rede, um usuário impaciente: a segunda chamada de
 *   `placeOrder` com a mesma chave não cria um segundo pedido nem dispara um segundo evento —
 *   ela devolve o que já existe. A chave é a identidade do agregado, então a idempotência não é um
 *   `if` no handler, é uma consequência do modelo.
 * - **contexto.** O cliente pode **assinar antes de mandar**: como ele já conhece a chave, ele abre
 *   `onOrderUpdated(key)` e só então dispara a mutation. Não há janela entre "o pedido começou" e
 *   "eu consegui escutar" — que é exatamente a corrida que um id gerado no servidor cria.
 *
 * Todo evento do fluxo carrega a chave, nos dois serviços, o que a torna também a chave de
 * correlação: é por ela que a subscription reconhece "os eventos deste pedido" entre os de todos os
 * outros — e, como o critério de uma subscription CQSRS é a sua chave de compartilhamento, dois
 * assinantes do mesmo pedido custam um stream só.
 */
export const OrderKey = z.uuid({ error: 'key precisa ser um UUID' }).brand<'OrderKey'>();
export type OrderKey = z.infer<typeof OrderKey>;

/** Para o cliente (ou o teste) gerar a sua chave antes de falar com o servidor. */
export const newOrderKey = (): OrderKey => OrderKey.parse(randomUUID());
