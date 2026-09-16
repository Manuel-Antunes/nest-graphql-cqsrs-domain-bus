import {
  createMap,
  forMember,
  fromValue,
  mapFrom,
  mapWith,
  mapWithArguments,
  type Mapper,
  type MappingConfiguration,
  type MappingProfile,
} from '@automapper/core';
import { AutomapperProfile, InjectMapper } from '@automapper/nestjs';
import { Injectable } from '@nestjs/common';
import { CreatePostCommand } from '../../application/post/command/create-post.command';
import { UpdatePostCommand } from '../../application/post/command/update-post.command';
import { PostCreatedEvent } from '../../domain/post/event/post-created.event';
import { PostUpdatedEvent } from '../../domain/post/event/post-updated.event';
import { Post } from '../../domain/post/post.entity';
import { PostContent } from '../../domain/post/vo/post-content';
import { PostId } from '../../domain/post/vo/post-id';
import { PostTitle } from '../../domain/post/vo/post-title';
import { Tag } from '../../domain/tag/tag.entity';
import type { Author } from '../../domain/user/author.entity';
import { UserId } from '../../domain/user/vo/user-id';
import { CreatePostInput } from '../../dto/graphql/create-post.input';
import { PostView } from '../../dto/graphql/post.view';
import { TagView } from '../../dto/graphql/tag.view';
import { UpdatePostInput } from '../../dto/graphql/update-post.input';
import { valueObjectConverter } from './value-object.converter';

/** O autor que o `PostMutationResolver` injeta, via `extraArgs`. */
const authorOf = (args: Record<string, unknown>): Author => args.author as Author;

/**
 * Os mapeamentos do agregado Post. Só o que é **diferente** entre os dois lados aparece aqui: campo de
 * mesmo nome e mesmo tipo atravessa sozinho, e a travessia value object ↔ texto é declarada uma vez
 * no {@link valueObjectConverter}.
 *
 * Quem diz que um campo existe é a própria classe: `@AutoMap()` na propriedade, nos eventos, nos
 * commands e nas entidades; e no shape Zod, pelo `DECORATOR_REGISTRY`, nos DTOs gerados.
 *
 * ## Por que três origens para a mesma `PostView`
 * É o desenho de leitura que este projeto já tinha:
 *
 * - `Post` → a entidade, para queries e mutations. Exige `tags` populada (ver `PostRepository`);
 * - `PostCreatedEvent` / `PostUpdatedEvent` → o payload, para as subscriptions. A view nasce do que
 *   passou pelo `EventBus`, **sem consultar o banco** — é por isso que ela não pode sair do `Post`.
 */
@Injectable()
export class PostProfile extends AutomapperProfile {
  constructor(@InjectMapper() mapper: Mapper) {
    super(mapper);
  }

  override get profile(): MappingProfile {
    return (mapper) => {
      // ---- domínio → protocolo ------------------------------------------------------------

      createMap(mapper, Tag, TagView);

      createMap(
        mapper,
        Post,
        PostView,
        /**
         * O autor vira um **id**, e não um retrato. É o que permite navegar: quem resolve
         * `Post.author` é o `PostAuthorResolver`, a partir daqui. E `author.id` não custa consulta —
         * uma referência do MikroORM sabe o próprio id sem ir ao banco.
         */
        forMember(
          (view) => view.authorId,
          mapFrom((post) => post.author.id),
        ),
        /**
         * `Post.tags` não tem `@AutoMap()`: uma `Collection` do MikroORM não é um array, e o mapeador
         * trataria a coleção inteira como um objeto a traduzir. Quem a abre é esta linha — e ela exige
         * a coleção populada, como sempre exigiu.
         */
        forMember(
          (view) => view.tags,
          mapWith(TagView, Tag, (post) => post.tags.getItems()),
        ),
      );

      /**
       * `onPostCreated` publica sempre o post como ele nasceu: v1, sem tags. A tag padrão chega em
       * seguida, por `onPostUpdated`, quando a saga a atribui.
       */
      createMap(
        mapper,
        PostCreatedEvent,
        PostView,
        forMember(
          (view) => view.id,
          mapFrom((event) => new PostId(event.postId)),
        ),
        forMember(
          (view) => view.createdAt,
          mapFrom((event) => event.occurredAt),
        ),
        forMember(
          (view) => view.updatedAt,
          mapFrom((event) => event.occurredAt),
        ),
        forMember((view) => view.version, fromValue(1)),
        // `mapFrom`, e não `fromValue([])`: o `fromValue` guarda o valor, e todas as views passariam
        // a dividir o mesmo array.
        forMember(
          (view) => view.tags,
          mapFrom(() => [] as TagView[]),
        ),
      );

      createMap(
        mapper,
        PostUpdatedEvent,
        PostView,
        forMember(
          (view) => view.id,
          mapFrom((event) => new PostId(event.postId)),
        ),
        forMember(
          (view) => view.updatedAt,
          mapFrom((event) => event.occurredAt),
        ),
        // O payload carrega as tags como `{ tagId, name }` — objetos anônimos, sem classe que o
        // mapeador possa citar.
        forMember(
          (view) => view.tags,
          mapFrom((event) => event.tags.map(({ tagId, name }) => new TagView({ id: tagId, name }))),
        ),
      );

      // ---- protocolo → aplicação ----------------------------------------------------------

      /**
       * O autor **não** vem do input: ele vem da sessão, por `extraArgs` — ver `PostMutationResolver`.
       * É o que impede alguém publicar em nome de outro escrevendo outro nome no corpo, e é por isso
       * que `CreatePostInput` não tem campo de autor para começar.
       *
       * O que segue para o command é o retrato (id e nome), e não o agregado: quem valida que aquele
       * id é de um autor é a chave estrangeira.
       */
      createMap(
        mapper,
        CreatePostInput,
        CreatePostCommand.CreatePost,
        forMember(
          (command) => command.postId,
          mapFrom(() => PostId.generate()),
        ),
        forMember(
          (command) => command.authorId,
          mapWithArguments((_input, args) => authorOf(args).id),
        ),
        forMember(
          (command) => command.authorName,
          mapWithArguments((_input, args) => authorOf(args).name),
        ),
      );

      /**
       * O `assertValid()` é a única validação que a borda faz: um id que não é UUID não chega ao
       * command. Quando ele recusa, a falha chega ao cliente embrulhada num `MapMemberError` — quem a
       * descasca de volta para `BAD_USER_INPUT` é o `DomainExceptionFilter`.
       */
      createMap(
        mapper,
        UpdatePostInput,
        UpdatePostCommand.UpdatePost,
        forMember(
          (command) => command.postId,
          mapFrom((input) => input.id.assertValid()),
        ),
      );
    };
  }

  /**
   * Os value objects que **atravessam sozinhos** neste perfil — e só eles.
   *
   * A lista é curta porque um conversor só é consultado nos membros **automáticos**: um membro que
   * passa por `forMember` nunca o vê. `PostId`, `TagId` e `TagName` não estão aqui por isso — ou são o
   * mesmo tipo dos dois lados (e aí são copiados por referência), ou são montados à mão lá em cima.
   * `UserName` também não: o `authorName` do command vem de `mapWithArguments`, que é membro custom.
   *
   * O que sobra é o que cruza de tipo num campo de mesmo nome:
   *
   * - `PostTitle`/`PostContent`: `CreatePostInput` → command desembrulha, evento → `PostView` embrulha;
   * - `UserId`: o `authorId` do evento é texto e o da view é value object.
   *
   * Cada um dos três está prendido por teste — tirar qualquer um deixa o `post.profile.spec` vermelho.
   * E acrescentar um que não cruze não dá erro nenhum, só ruído: é por isso que a lista é do que a
   * travessia usa, e não do que o agregado tem.
   */
  protected override get mappingConfigurations(): MappingConfiguration[] {
    return [
      valueObjectConverter(PostTitle, String),
      valueObjectConverter(PostContent, String),
      valueObjectConverter(UserId, String),
    ];
  }
}
