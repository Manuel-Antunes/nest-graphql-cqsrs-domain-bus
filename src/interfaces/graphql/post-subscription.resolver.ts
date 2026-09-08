import { QueryBus } from '@nestjs/cqrs';
import { Args, ID, Resolver, Subscription } from '@nestjs/graphql';
import { map } from 'rxjs';
import { OnPostCreatedSubscription } from '../../application/post/subscription/on-post-created.subscription';
import { OnPostUpdatedSubscription } from '../../application/post/subscription/on-post-updated.subscription';
import { PostView } from '../../dto/graphql/post.view';
import { PostViewMapper } from '../../mapper/post-view.mapper';
import { observableToAsyncIterable } from './observable-to-async-iterable';

/**
 * Camada de interface das **subscriptions** GraphQL. Quem sabe quais eventos alimentam cada
 * subscription é o handler de aplicação (via `QueryBus`); aqui só se mapeia o evento para a view e se
 * converte o `Observable` no async iterable que o transporte (Mercurius, graphql-ws) consome.
 *
 * ## Filtro por tópico
 * `onPostUpdated(postId)` usa o `filter` nativo do `@Subscription` do @nestjs/graphql — o mesmo da
 * documentação (`docs.nestjs.com/graphql/subscriptions#filtering-subscriptions`). Ele recebe o payload
 * e as variáveis daquele assinante; o Mercurius o aplica com o seu `withFilter`, por cima do nosso
 * iterador. Cada assinante ativo recebe (ou não) conforme o próprio filtro — sem `filter()` no
 * Observable, que é o mesmo para todos.
 *
 * ## `resolve`
 * Por padrão o graphql-js procura o campo pelo nome dentro do payload (`payload.onPostUpdated`).
 * Como o iterador entrega a `PostView` direto, `resolve` diz que o payload **é** o valor.
 */
@Resolver(() => PostView)
export class PostSubscriptionResolver {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly viewMapper: PostViewMapper,
  ) {}

  @Subscription(() => PostView, {
    name: 'onPostCreated',
    description: 'Emite a cada PostCreated (tópico global)',
    resolve: (payload: PostView) => payload,
  })
  async onPostCreated(): Promise<AsyncIterable<PostView>> {
    const events$ = await this.queryBus.execute(new OnPostCreatedSubscription());
    return observableToAsyncIterable(events$.pipe(map((event) => this.viewMapper.fromCreatedEvent(event))));
  }

  @Subscription(() => PostView, {
    name: 'onPostUpdated',
    description: 'Emite a cada PostUpdated; postId filtra por tópico (null = todos)',
    filter: (payload: PostView, variables: { postId?: string | null }) =>
      !variables.postId || payload.id === variables.postId,
    resolve: (payload: PostView) => payload,
  })
  async onPostUpdated(
    @Args('postId', { type: () => ID, nullable: true }) _postId?: string | null,
  ): Promise<AsyncIterable<PostView>> {
    const events$ = await this.queryBus.execute(new OnPostUpdatedSubscription());
    return observableToAsyncIterable(events$.pipe(map((event) => this.viewMapper.fromUpdatedEvent(event))));
  }
}
