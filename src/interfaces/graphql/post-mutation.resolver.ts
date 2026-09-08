import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { FindPostQuery } from '../../application/post/query/find-post.query';
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
    const postId = await this.commandBus.execute(this.inputMapper.toCreateCommand(input));
    return this.savedPost(postId);
  }

  @Mutation(() => PostView, { description: 'Despacha UpdatePostCommand e devolve o Post já gravado' })
  async updatePost(@Args('input') input: UpdatePostInput): Promise<PostView> {
    const command = this.inputMapper.toUpdateCommand(input);
    await this.commandBus.execute(command);
    return this.savedPost(command.postId);
  }

  private async savedPost(postId: PostId): Promise<PostView> {
    const post = await this.queryBus.execute(new FindPostQuery(postId));
    if (!post) {
      throw new PostNotFoundException(postId);
    }
    return this.viewMapper.fromPost(post);
  }
}
