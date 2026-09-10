import { Injectable, type PipeTransform } from '@nestjs/common';
import { NotAnAuthorException } from '../../domain/user/exception/not-an-author.exception';
import type { Author } from '../../domain/user/author.entity';
import type { User } from '../../domain/user/user.entity';

/**
 * `User` → `Author`: o **upcast** da borda, como um pipe.
 *
 * `canWritePosts()` é `this is Author`, então o que sai daqui não é "um user que talvez escreva": é
 * um `Author`. Daí para baixo o `PostInputMapper` e o `Post.create` não conseguem receber outra coisa
 * — um Reader não é barrado por um `if` espalhado pelos resolvers, ele simplesmente não cabe na
 * assinatura.
 *
 * Na prática o `@Roles([AUTHOR_ROLE])` barra antes, pelo papel que veio no token. Este pipe cobre o
 * caso em que as duas verdades divergem — token diz author, o perfil de domínio não é um. O tipo é a
 * verdade final.
 *
 * Não tem dependência nenhuma; é um pipe (e não uma função solta) para poder entrar na cadeia do
 * parâmetro logo depois do {@link SessionUserPipe} — é o Nest encadeando pipes que faz a composição.
 */
@Injectable()
export class AuthorPipe implements PipeTransform<User, Author> {
  transform(user: User): Author {
    const userId = user.id;
    if (!user.canWritePosts()) {
      throw new NotAnAuthorException(userId);
    }
    return user;
  }
}
