import { Query } from '@nestjs/cqrs';
import type { Observable } from 'rxjs';
import type { PostUpdatedEvent } from '../../../domain/post/event/post-updated.event';

/**
 * Subscription query: "me avise quando um Post for atualizado" — qualquer Post. O filtro por tópico
 * (`postId`) não mora aqui de propósito: ele é o `filter` nativo do `@Subscription` do @nestjs/graphql,
 * avaliado por assinante, na camada de interface.
 */
export class OnPostUpdatedSubscription extends Query<Observable<PostUpdatedEvent>> {}
