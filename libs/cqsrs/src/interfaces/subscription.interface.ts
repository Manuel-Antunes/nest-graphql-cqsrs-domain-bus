import { EVENT_TYPE_SYMBOL } from './constants';

/**
 * O contrato de uma mensagem de subscription: **o que o `SubscriptionBus` precisa saber sobre ela**,
 * e nada mais.
 *
 * O `IQuery` e o `ICommand` do @nestjs/cqrs são marcadores vazios porque os buses deles não precisam
 * de nada da mensagem — o roteamento vem da metadata gravada na classe, e o handler faz o resto.
 * Um bus de subscriptions precisa de três coisas, e as três vêm da mensagem:
 *
 * - **`filter`** — este evento interessa a quem pediu?
 * - **`key`** — quem é este pedido? Duas mensagens com a mesma chave *são* o mesmo pedido, e o bus
 *   as atende com um stream só;
 * - **`[EVENT_TYPE_SYMBOL]`** — de que tipo é o evento. Só para o compilador: é daqui que sai o
 *   `Observable<TEvent>` de `subscribe(sub)` e o retorno que o `ISubscriptionHandler` cobra.
 *
 * Declarar isso na interface, em vez de assumir a classe `Subscription`, é o que deixa o bus
 * agnóstico: ele depende do contrato, não da herança. Qualquer classe que responda às duas perguntas
 * serve, sem herdar nada:
 *
 * ```ts
 * class OnMyPosts implements ISubscription<PostUpdatedEvent> {
 *   readonly [EVENT_TYPE_SYMBOL]: PostUpdatedEvent; // só tipo; nunca é lida
 *
 *   constructor(private readonly author: string) {}
 *
 *   get key(): string { return `OnMyPosts(${this.author})`; }
 *   filter(event: PostUpdatedEvent): boolean { return event.author === this.author; }
 * }
 * ```
 *
 * **Classe, e não um objeto qualquer**: o roteamento continua vindo da metadata que o
 * `@SubscriptionHandler` grava na *classe* da mensagem — exatamente como o `@QueryHandler` faz. O que
 * a interface dispensa é a **herança**, não a classe.
 *
 * E é isso que reduz a {@link Subscription} ao que ela deve ser: um *helper*. Ela não define o que é
 * uma subscription — a interface define. Ela só implementa o contrato do jeito que serve na maior
 * parte das vezes, derivando a `key` do critério e trazendo um `filter` que passa tudo.
 */
export interface ISubscription<TEvent = any> {
  /** Só o tipo — ver {@link EVENT_TYPE_SYMBOL}. Nunca é lida em runtime. */
  readonly [EVENT_TYPE_SYMBOL]: TEvent;

  /**
   * A identidade deste pedido. Mesmo tipo de subscription + mesmo critério = mesma chave = mesmo
   * stream, uma inscrição só na fonte. Ver {@link Subscription.key} para a derivação padrão.
   */
  readonly key: string;

  /**
   * O filtro: roda uma vez por evento, **dentro** do stream, antes de ele chegar a qualquer
   * assinante — e não uma vez por assinante.
   */
  filter(event: TEvent): boolean;
}
