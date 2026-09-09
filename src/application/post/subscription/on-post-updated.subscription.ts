import { EventBus, ofType } from '@nestjs/cqrs';
import type { Observable } from 'rxjs';
import { type ISubscriptionHandler, Subscription, SubscriptionHandler } from '../../../cqsrs';
import { PostUpdatedEvent } from '../../../domain/post/event/post-updated.event';

/** A fatia de `OnPostUpdated`: o critério, a mensagem e o handler — ver `CreatePostCommand` para o padrão. */
export namespace OnPostUpdatedSubscription {
  /** O critério de `OnPostUpdated`. `postId` ausente (ou nulo) quer dizer "todos os posts". */
  export interface Criteria {
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
   * que ela filtra — e, agora, ao lado do handler dela também.
   */
  export class OnPostUpdated extends Subscription<PostUpdatedEvent, Criteria> {
    override match(event: PostUpdatedEvent): boolean {
      return !this.criteria.postId || event.postId === this.criteria.postId;
    }
  }

  /**
   * Handler de `OnPostUpdated`: o `EventBus` filtrado pelos `PostUpdatedEvent`.
   *
   * Repare no que ele **não** faz: nada de `postId`. O handler responde por "de onde vêm os eventos
   * desta subscription"; o recorte por assinante é o `filter` da própria mensagem, aplicado pelo bus.
   */
  @SubscriptionHandler(OnPostUpdated)
  export class Handler implements ISubscriptionHandler<OnPostUpdated> {
    constructor(private readonly eventBus: EventBus) {}

    subscribe(): Observable<PostUpdatedEvent> {
      return this.eventBus.pipe(ofType(PostUpdatedEvent));
    }
  }
}
