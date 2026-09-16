import type { Mapper } from '@automapper/core';
import { InjectMapper, MapInterceptor, MapPipe } from '@automapper/nestjs';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Roles } from '@thallesp/nestjs-better-auth';
import { UseFilters, UseInterceptors } from '@nestjs/common';
import { CurrentAuthor } from '../decorators/current-user.decorator';
import { MikroOrmExceptionFilter } from '../filters/mikro-orm-exception.filter';
import { AUTHOR_ROLE } from '../../domain/user/user.entity';
import { type Author } from '../../domain/user/author.entity';
import { CreatePostCommand } from '../../application/post/command/create-post.command';
import { UpdatePostCommand } from '../../application/post/command/update-post.command';
import { FindPostQuery } from '../../application/post/query/find-post.query';
import { PostRequest } from '../../application/shared/post-request';
import { Post } from '../../domain/post/post.entity';
import { PostNotFoundException } from '../../domain/post/exception/post-not-found.exception';
import type { PostId } from '../../domain/post/vo/post-id';
import { CreatePostInput } from '../../dto/graphql/create-post.input';
import { PostView } from '../../dto/graphql/post.view';
import { UpdatePostInput } from '../../dto/graphql/update-post.input';

/**
 * Camada de interface das **mutations** GraphQL: despacha o command pelo `CommandBus` e devolve o Post
 * lido de volta pelo `QueryBus`.
 *
 * Como o command handler salva antes de devolver, a query logo em seguida encontra o post gravado.
 * O que ela **não** garante é a tag padrão: a saga que a atribui é assíncrona, então `createPost`
 * costuma devolver o post em `version: 1` — e o cliente vê a tag chegar pelo `onPostUpdated`.
 *
 * ## As duas mutations entram por portas diferentes, e é de propósito
 * O `updatePost` usa o `MapPipe` da lib: tudo o que o command precisa está no input, então mapear é
 * uma declaração e some do corpo do método.
 *
 * O `createPost` não pode: o command precisa do **autor**, que não está no input — está na sessão. E um
 * pipe do NestJS não enxerga o `ExecutionContext`, então o `MapPipe` montaria o command com `authorId`
 * e `authorName` vazios, e quem descobriria seria a chave estrangeira, tarde. Aqui o mapeamento é uma
 * **chamada explícita**, com o autor entrando por `extraArgs` — é a única do projeto, e ela é uma linha
 * em vez de um decorator de parâmetro mais um pipe só para esconder essa linha.
 *
 * A assimetria não é acidente de implementação: é a diferença entre uma mutation que fala de autoria e
 * outra que não fala.
 *
 * ## A borda é onde a request nasce
 * O segundo argumento do `commandBus.execute` é a `PostRequest`: o contexto que vai acompanhar toda a
 * cadeia que esta mutation abre. A chave dele é o `PostId` do próprio command — o que o mapeamento
 * acabou de gerar, no `createPost`, e o que o cliente informou, no `updatePost`. Daí em diante o id
 * anda como metadado das mensagens, e a saga o recebe como value object em vez de reconstruí-lo do
 * payload do evento. Ver `PostRequest`.
 *
 * As queries ficam de fora: uma leitura não abre cadeia causal nenhuma, e os `@QueryHandler` deste
 * projeto não são request-scoped — o contexto de que eles precisam é o do ORM, aberto na borda.
 *
 * ## Autorização em duas alturas
 * `@Roles([AUTHOR_ROLE])` é a guarda de **borda**: responde "esta pessoa pode escrever posts?", lendo
 * o `user.role` do Better Auth. Ela não responde "pode escrever *este* post" — isso é invariante do
 * agregado, e mora em `Post.assertWrittenBy`. As duas precisam passar, e a segunda vale também para
 * caminhos que nunca veem um guard (um command despachado por uma saga, por exemplo).
 *
 * O upcast para `Author` é a terceira, e nas duas mutations ele é o `@CurrentAuthor()` — o resolver não
 * consegue esquecê-lo, porque é o que produz o parâmetro que ele declara. No `createPost` é também o
 * que garante que o `authorId` do command seja de alguém que já passou por todo o processo de saber que
 * é um autor: é por isso que o command handler não relê o agregado.
 *
 * ## `@UseFilters(MikroOrmExceptionFilter)`
 * Confiar na chave estrangeira em vez de checar antes só é possível se a recusa dela virar um erro de
 * usuário em vez de um 500. Este é o único lugar onde uma violação de integridade é uma resposta
 * possível ao que o cliente pediu, e é por isso que o filtro é do resolver e não global.
 */
@Resolver('Post')
@UseFilters(MikroOrmExceptionFilter)
export class PostMutationResolver {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    @InjectMapper() private readonly mapper: Mapper,
  ) {}

  @Roles([AUTHOR_ROLE])
  @Mutation('createPost')
  @UseInterceptors(MapInterceptor(Post, PostView))
  async createPost(
    @Args('input') input: CreatePostInput,
    @CurrentAuthor() author: Author,
  ): Promise<Post> {
    const command = await this.mapper.mapAsync(
      input,
      CreatePostInput,
      CreatePostCommand.CreatePost,
      { extraArgs: () => ({ author }) },
    );
    const postId = await this.commandBus.execute(command, new PostRequest(command.postId));
    return this.savedPost(postId);
  }

  @Roles([AUTHOR_ROLE])
  @Mutation('updatePost')
  @UseInterceptors(MapInterceptor(Post, PostView))
  async updatePost(
    @Args('input', MapPipe(UpdatePostInput, UpdatePostCommand.UpdatePost))
    command: UpdatePostCommand.UpdatePost,
    @CurrentAuthor() _author: Author,
  ): Promise<Post> {
    await this.commandBus.execute(command, new PostRequest(command.postId));
    return this.savedPost(command.postId);
  }

  private async savedPost(postId: PostId): Promise<Post> {
    const post = await this.queryBus.execute(new FindPostQuery.FindPost(postId));
    if (!post) {
      throw new PostNotFoundException(postId);
    }
    return post;
  }
}
