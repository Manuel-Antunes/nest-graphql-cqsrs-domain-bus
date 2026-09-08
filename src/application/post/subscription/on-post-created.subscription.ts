import { Subscription } from '../../../cqsrs';
import type { PostCreatedEvent } from '../../../domain/post/event/post-created.event';

/**
 * Subscription: "me avise quando um Post for criado" — todos, sem critério.
 *
 * No Axon isso era uma *subscription query* — uma query cujo resultado é um `Flux`. Aqui é a terceira
 * mensagem do CQSRS: uma `Subscription` cujo handler não consulta o banco, ele **liga o stream ao
 * `EventBus`**. É por isso que ela mora em `application/post/subscription`, e não na camada de
 * interface: decidir quais eventos alimentam qual subscription é regra da aplicação; a interface só
 * converte o stream para o transporte.
 *
 * Sem critério, `TCriteria` fica `void`: `new OnPostCreatedSubscription()`, e o `filter` herdado
 * passa tudo.
 */
export class OnPostCreatedSubscription extends Subscription<PostCreatedEvent> {}
