import { z } from 'zod';
import { InheritValidatedMetadata, ValidatedDto } from '../../validated-dto/mixins';
import { PostContent } from '../../domain/post/vo/post-content';
import { PostId } from '../../domain/post/vo/post-id';
import { PostTitle } from '../../domain/post/vo/post-title';
import { UserId } from '../../domain/user/vo/user-id';
import { TagView } from './tag.view';

/**
 * O shape do read model de um Post.
 *
 * Os quatro campos de texto são **value objects embutidos** (`PostId.field()` e companhia) — o
 * `@Embedded` do Java: o DTO declara `id: PostId`, e o protocolo continua vendo `ID!`. Os outros três
 * são valores simples, e ficam como o Zod os descreve.
 *
 * `authorId` é o único campo do shape que **não** tem campo correspondente no `type Post`: ele é a
 * entrada do `PostAuthorResolver`, que o troca pelo `Author` do protocolo. Era `author: UserName` — o
 * nome copiado — e virou a identidade, porque é a identidade que permite navegar.
 *
 * Repare no que sumiu daqui: o `@Field`. O que o protocolo enxerga está escrito no `type Post` de
 * `src/graphql/post.graphql`, e o schema Zod voltou a ser só o que ele diz que é — a forma
 * **validada** do dado, sem uma segunda declaração do mesmo campo por baixo.
 */
const PostViewSchema = z.object({
  id: PostId.field(),
  title: PostTitle.field(),
  content: PostContent.field(),
  authorId: UserId.field(),
  createdAt: z.date(),
  updatedAt: z.date(),
  version: z.number().int().positive(),
});

/**
 * Read model de um Post — o mesmo shape em queries, mutations e subscriptions.
 *
 * Ele **não** achata os value objects do domínio: `title` é um `PostTitle`, e não uma `string`. O que
 * achata é a serialização — o escalar embutido colapsa para o valor cru, então o `Post.title` do
 * schema GraphQL é `String!` e nada disto vaza para o cliente. Quem faz a travessia é o
 * `GraphQLString`, que chama o `valueOf` do value object ao serializar; o resolver padrão do
 * graphql-js lê a propriedade e entrega o objeto como está.
 *
 * `tags` não entra no schema Zod: o campo `Post.tags(first, after)` é resolvido à parte, pelo
 * `PostTagsResolver`, como cursor connection. A lista fica aqui só para o resolver recortar — e é por
 * isso que ela entra pelo parâmetro `Extras` do mixin, que acrescenta a propriedade sem inventar um
 * campo no shape validado.
 *
 * `author` é o caso inverso e vale comparar: ele **não** fica aqui de forma nenhuma. A tag já vinha com
 * o post (é uma relação pequena, populada no repositório), então guardá-la poupa uma consulta; o autor
 * é um agregado à parte, e guardar um retrato dele aqui era justamente o que impedia navegar até ele.
 * O que fica é `authorId`, e o resolver faz o resto.
 */
@InheritValidatedMetadata()
export class PostView extends ValidatedDto<typeof PostViewSchema, { tags: TagView[] }>(
  PostViewSchema,
) {}
