import { Session } from '@thallesp/nestjs-better-auth';
import { AuthorPipe } from '../pipes/author.pipe';
import { SessionUserPipe } from '../pipes/session-user.pipe';

/**
 * O perfil de domínio de quem está autenticado, direto no parâmetro do resolver.
 *
 * ```ts
 * async me(@CurrentUser() user: User) { … }
 * ```
 *
 * É o `@Session()` da lib **composto** com um pipe, e não um decorator paralelo: quem lê a sessão
 * continua sendo o Better Auth, e o que acrescentamos é a tradução para o domínio. Ver
 * {@link SessionUserPipe}.
 */
export const CurrentUser = () => Session(SessionUserPipe);

/**
 * O mesmo, já **como `Author`** — o parâmetro que os resolvers de escrita pedem.
 *
 * ```ts
 * @Roles([AUTHOR_ROLE])
 * @Mutation(() => PostView)
 * async createPost(@Args('input') input: CreatePostInput, @CurrentAuthor() author: Author) { … }
 * ```
 *
 * A composição é a do próprio Nest: um parâmetro aceita **vários pipes**, aplicados em ordem, e a
 * saída de um alimenta o seguinte. `sessão → SessionUserPipe → User → AuthorPipe → Author`. Cada peça
 * faz uma coisa e é testável sozinha; o decorator só as encadeia.
 *
 * Quem recusa um não-autor é o {@link AuthorPipe}, então nenhum resolver precisa escrever a guarda —
 * e nenhum consegue esquecê-la, porque o tipo do parâmetro é o que ela produz.
 */
export const CurrentAuthor = () => Session(SessionUserPipe, AuthorPipe);
