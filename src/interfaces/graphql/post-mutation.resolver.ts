import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Roles } from '@thallesp/nestjs-better-auth';
import { UseFilters } from '@nestjs/common';
import { CurrentAuthor } from '../decorators/current-user.decorator';
import { MikroOrmExceptionFilter } from '../filters/mikro-orm-exception.filter';
import { AUTHOR_ROLE } from '../../domain/user/user.entity';
import { type Author } from '../../domain/user/author.entity';
import { FindPostQuery } from '../../application/post/query/find-post.query';
import { PostRequest } from '../../application/shared/post-request';
import { PostNotFoundException } from '../../domain/post/exception/post-not-found.exception';
import type { PostId } from '../../domain/post/vo/post-id';
import { CreatePostInput } from '../../dto/graphql/create-post.input';
import { PostView } from '../../dto/graphql/post.view';
import { UpdatePostInput } from '../../dto/graphql/update-post.input';
import { PostInputMapper } from '../mapper/post-input.mapper';
import { PostViewMapper } from '../mapper/post-view.mapper';

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
 * projeto não são request-scoped — o contexto de que eles precisam é o do ORM, aberto na borda.
 *
 * ## Autorização em duas alturas
 * `@Roles([AUTHOR_ROLE])` é a guarda de **borda**: responde "esta pessoa pode escrever posts?", lendo
 * o `user.role` do Better Auth. Ela não responde "pode escrever *este* post" — isso é invariante do
 * agregado, e mora em `Post.assertWrittenBy`. As duas precisam passar, e a segunda vale também para
 * caminhos que nunca veem um guard (um command despachado por uma saga, por exemplo).
 *
 * ## O upcast é um parâmetro
 * `@CurrentAuthor()` é o `@Session()` da lib composto com dois pipes — `SessionUserPipe` traduz a
 * sessão no perfil de domínio, `AuthorPipe` faz o upcast e recusa quem não escreve. O resolver não
 * tem guarda nenhuma escrita à mão, e também **não consegue esquecê-la**: o que ele declara é o tipo
 * que ela produz. É o que permite o command handler não reler o agregado — quando o `authorId` chega
 * lá, ele já passou por todo o processo de saber que é de um autor.
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
    private readonly inputMapper: PostInputMapper,
    private readonly viewMapper: PostViewMapper,
  ) {}

  @Roles([AUTHOR_ROLE])
  @Mutation('createPost')
  async createPost(@Args('input') input: CreatePostInput, @CurrentAuthor() author: Author): Promise<PostView> {
    const command = this.inputMapper.toCreateCommand(input, author);
    const postId = await this.commandBus.execute(command, new PostRequest(command.postId));
    return this.savedPost(postId);
  }

  @Roles([AUTHOR_ROLE])
  @Mutation('updatePost')
  async updatePost(
    @Args('input') input: UpdatePostInput,
    @CurrentAuthor() _author: Author,
  ): Promise<PostView> {
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
