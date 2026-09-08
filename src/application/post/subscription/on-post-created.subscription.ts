import { Query } from '@nestjs/cqrs';
import type { Observable } from 'rxjs';
import type { PostCreatedEvent } from '../../../domain/post/event/post-created.event';

/**
 * Subscription query: "me avise quando um Post for criado".
 *
 * No Axon isso era uma *subscription query* — uma query cujo resultado é um `Flux`. Aqui é a mesma
 * ideia com as peças do @nestjs/cqrs: uma `Query` cujo resultado é um `Observable`, e cujo handler
 * não consulta o banco — ele **liga o stream ao `EventBus`**. É por isso que ela mora em
 * `application/post/subscription`, e não na camada de interface: decidir quais eventos alimentam
 * qual subscription é regra da aplicação; a interface só converte o stream para o transporte.
 */
export class OnPostCreatedSubscription extends Query<Observable<PostCreatedEvent>> {}
