import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { FindPostQuery } from '../../application/post/query/find-post.query';
import { PostRequest } from '../../application/shared/post-request';
import { PostNotFoundException } from '../../domain/post/exception/post-not-found.exception';
import type { PostId } from '../../domain/post/vo/post-id';
import { CreatePostInput } from '../../dto/graphql/create-post.input';
import { PostView } from '../../dto/graphql/post.view';
import { UpdatePostInput } from '../../dto/graphql/update-post.input';
import { PostInputMapper } from '../../mapper/post-input.mapper';
import { PostViewMapper } from '../../mapper/post-view.mapper';

/**
 * Camada de interface das **mutations** GraphQL: traduz o input para command, despacha pelo
 * `CommandBus` e devolve o Post lido de volta pelo `QueryBus`.
 *
 * Como o command handler salva antes de devolver, a query logo em seguida encontra o post gravado.
 * O que ela **não** garante é a tag padrão: a saga que a atribui é assíncrona, então `createPost`
 * costuma devolver o post em `version: 1` — e o cliente vê a tag chegar pelo `onPostUpdated`.
 *
 * ## A borda é onde a request nasce
 * O segundo argumento do `commandBus.execute` é a `PostRequest`: o contexto que vai acompanhar toda a
 * cadeia que esta mutation abre. A chave dele é o `PostId` do próprio command — o que o
 * `PostInputMapper` acabou de gerar, no `createPost`, e o que o cliente informou, no `updatePost`.
 * Daí em diante o id anda como metadado das mensagens, e a saga o recebe como value object em vez de
 * reconstruí-lo do payload do evento. Ver `PostRequest`.
 *
 * As queries ficam de fora: uma leitura não abre cadeia causal nenhuma, e os `@QueryHandler` deste
 * projeto não são request-scoped — o contexto de que eles precisam é o do ORM (`@EnsureRequestContext`).
 */
@Resolver(() => PostView)
export class PostMutationResolver {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly inputMapper: PostInputMapper,
    private readonly viewMapper: PostViewMapper,
  ) {}

  @Mutation(() => PostView, { description: 'Despacha CreatePostCommand e devolve o Post já gravado' })
  async createPost(@Args('input') input: CreatePostInput): Promise<PostView> {
    const command = this.inputMapper.toCreateCommand(input);
    const postId = await this.commandBus.execute(command, new PostRequest(command.postId));
    return this.savedPost(postId);
  }

  @Mutation(() => PostView, { description: 'Despacha UpdatePostCommand e devolve o Post já gravado' })
  async updatePost(@Args('input') input: UpdatePostInput): Promise<PostView> {
    const command = this.inputMapper.toUpdateCommand(input);
    await this.commandBus.execute(command, new PostRequest(command.postId));
    return this.savedPost(command.postId);
  }

  private async savedPost(postId: PostId): Promise<PostView> {
    const post = await this.queryBus.execute(new FindPostQuery.FindPost(postId));
    if (!post) {
      throw new PostNotFoundException(postId);
    }
    return this.viewMapper.fromPost(post);
  }
}
