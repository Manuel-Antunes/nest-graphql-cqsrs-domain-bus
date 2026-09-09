import { Subscription } from '@app/cqsrs';
import type { PostUpdatedEvent } from '../../../domain/post/event/post-updated.event';

/** O critério de `OnPostUpdatedSubscription`. `postId` ausente (ou nulo) quer dizer "todos os posts". */
export interface OnPostUpdatedCriteria {
  readonly postId?: string | null;
}

/**
 * Subscription: "me avise quando um Post for atualizado" — todos, ou só um.
 *
 * O filtro por tópico mora **aqui**, e não na camada de interface: quem pede diz *qual post*
 * (`criteria.postId`, montado com os `@Args` do GraphQL), e a aplicação diz o que isso quer dizer
 * diante de um evento. O `SubscriptionBus` aplica esse `filter` dentro do stream, uma vez por
 * critério — então dois assinantes do mesmo `postId` custam uma inscrição só no `EventBus`.
 *
 * É a diferença para a versão anterior, em que o filtro era o `filter` nativo do `@Subscription` do
 * @nestjs/graphql: aquele era avaliado por assinante, na borda, e obrigava a aplicação a entregar o
 * stream inteiro para o transporte peneirar. Este é regra de aplicação escrita ao lado da mensagem
 * que ela filtra, e o transporte recebe só o que interessa.
 */
export class OnPostUpdatedSubscription extends Subscription<PostUpdatedEvent, OnPostUpdatedCriteria> {
  override filter(event: PostUpdatedEvent): boolean {
    return !this.criteria.postId || event.postId === this.criteria.postId;
  }
}
