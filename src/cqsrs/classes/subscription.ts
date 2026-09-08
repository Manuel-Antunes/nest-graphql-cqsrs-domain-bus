import { subscriptionKey } from '../helpers/subscription-key';
import { EVENT_TYPE_SYMBOL } from './constants';

/** O tipo do evento que uma subscription entrega. */
export type SubscriptionEvent<S> = S extends Subscription<infer TEvent, any> ? TEvent : never;

/**
 * O tipo do critério de filtro de uma subscription — o que a camada de interface precisa montar para
 * pedi-la. `SubscriptionCriteria<OnPostUpdatedSubscription>` é `{ postId?: string | null }`.
 */
export type SubscriptionCriteria<S> = S extends Subscription<any, infer TCriteria> ? TCriteria : never;

/**
 * A mensagem de uma subscription: "me avise a cada evento assim, que case com este critério".
 *
 * É a terceira mensagem do CQSRS, irmã do `Command<T>` e do `Query<T>` do @nestjs/cqrs — e a
 * diferença entre ela e uma query é o que justifica um bus próprio: uma query é *uma* resposta e
 * acabou (`Promise<T>`); uma subscription é um stream que fica aberto (`Observable<TEvent>`) até o
 * assinante ir embora. `execute` não descreve isso; `subscribe` descreve.
 *
 * ## O filtro mora aqui, e não na camada de interface
 * Uma subscription tem duas metades, e as duas são regra de aplicação:
 *
 * - **o critério** (`criteria`), o *dado*: quais eventos interessam. Quem o preenche é quem pede —
 *   normalmente a camada de interface, com os argumentos do protocolo (os `@Args` do GraphQL);
 * - **o filtro** (`filter`), a *regra*: o que aquele critério quer dizer diante de um evento. Quem a
 *   escreve é a aplicação, aqui, ao lado da mensagem.
 *
 * A interface diz *o quê*, a aplicação decide *como* — nenhuma das duas sabe da outra. E como o
 * `filter` é um método da própria mensagem, o `SubscriptionBus` aplica o filtro no stream sem saber
 * nada sobre o domínio: ele só chama `subscription.filter(event)`.
 *
 * ## O critério também é a chave
 * `key` é o critério serializado de forma estável ({@link subscriptionKey}). É o que o bus usa para
 * achar um stream que já esteja no ar: dois assinantes que pedem a mesma subscription com o mesmo
 * critério pedem, literalmente, a mesma coisa — então recebem o mesmo `Observable`, e o `EventBus`
 * enxerga um assinante só. É por isso que o critério é um campo, e não propriedades soltas na
 * subclasse: o que entra na chave fica explícito.
 *
 * ```ts
 * export class OnPostUpdatedSubscription extends Subscription<PostUpdatedEvent, { postId?: string | null }> {
 *   override filter(event: PostUpdatedEvent): boolean {
 *     return !this.criteria.postId || event.postId === this.criteria.postId;
 *   }
 * }
 * ```
 *
 * Sem critério nenhum, `TCriteria` fica `void` e o construtor pode ser chamado vazio:
 * `class OnPostCreatedSubscription extends Subscription<PostCreatedEvent> {}` → `new OnPostCreatedSubscription()`.
 */
export abstract class Subscription<TEvent, TCriteria = void> {
  /** Só o tipo — ver {@link EVENT_TYPE_SYMBOL}. Nunca é lido em runtime. */
  readonly [EVENT_TYPE_SYMBOL]: TEvent;

  constructor(readonly criteria: TCriteria) {}

  /**
   * O filtro: roda uma vez por evento, dentro do stream, antes de ele chegar em qualquer assinante.
   * O padrão passa tudo — uma subscription sem critério não filtra nada.
   */
  filter(_event: TEvent): boolean {
    return true;
  }

  /**
   * A identidade desta subscription *como pedido*: o tipo mais o critério. Duas instâncias com a
   * mesma chave são intercambiáveis, e o bus as atende com um stream só.
   */
  get key(): string {
    return `${this.constructor.name}(${subscriptionKey(this.criteria)})`;
  }
}
