import { z } from 'zod';
import { Author } from './author.entity';
import { UserRegisteredEvent } from './event/user-registered.event';
import { InvalidUserException } from './exception/invalid-user.exception';
import { Reader } from './reader.entity';
import type { UserEvent } from './user.entity';
import { AUTHOR_ROLE, User } from './user.entity';
import { Email } from './vo/email';
import type { UserId } from './vo/user-id';
import { UserName } from './vo/user-name';

/** O que é preciso para nascer um User: os dois value objects, validados juntos. */
const NewUser = z.object({ email: Email.field(), name: UserName.field() });
export type NewUser = z.input<typeof NewUser>;

/**
 * A fábrica polimórfica do User: **o papel decide a classe**.
 *
 * ## Por que ela não é `User.register`
 * Na versão Java isto é `Users.register(...)`, e a lista de tipos concretos é uma anotação na própria
 * raiz (`@EventSourced(concreteTypes = {Reader.class, Author.class})`). Java pode: a raiz cita as
 * subclasses, as subclasses estendem a raiz, e o compilador resolve o mútuo.
 *
 * Em TypeScript isso é um **ciclo de módulo** com efeito real: `class Author extends User` precisa do
 * `User` já avaliado, então quem carregasse `user.entity` primeiro veria `extends undefined`. A saída
 * seria auto-registro — cada subclasse se anunciando ao carregar —, mas aí quem importasse só
 * `user.entity` construiria users com metade dos tipos disponíveis, e a falha é silenciosa: um author
 * nasceria leitor.
 *
 * Este arquivo é a resposta que o TypeScript pede: **um módulo que conhece os três**. O grafo fica de
 * mão única (`user.entity` ← `reader`/`author` ← `user.factory`), e importar `Users` traz a hierarquia
 * inteira — não há como pedir metade dela.
 */
export const Users = {
  /**
   * Construtor nomeado do User. **O papel decide a classe**: `author` nasce {@link Author}, qualquer
   * outra coisa nasce {@link Reader} — a mesma leitura que {@link Users.fromHistory} faz do primeiro
   * evento, para que decidir e reconstituir não possam divergir.
   *
   * @param supersedes O stream que esta criação substitui, quando ela vem de uma promoção.
   * @throws InvalidUserException se email ou name violarem suas invariantes
   */
  register(
    id: UserId,
    input: NewUser,
    role: string | null,
    now: Date,
    supersedes: UserId | null = null,
  ): User {
    const parsed = NewUser.safeParse(input);
    if (!parsed.success) {
      throw InvalidUserException.fromZod(parsed.error);
    }
    const user = Users.emptyFor(role);
    user.apply(
      new UserRegisteredEvent(
        id.value,
        parsed.data.email.value,
        parsed.data.name.value,
        role,
        supersedes?.value ?? null,
        now,
      ),
    );
    return user;
  },

  /**
   * Reconstitui um User a partir do stream dele. O tipo concreto sai do **primeiro evento**, como no
   * Axon — daí este método existir em vez de um `new User()` seguido de `loadFromHistory`: sem olhar
   * o primeiro evento não há classe para instanciar.
   */
  fromHistory(events: readonly UserEvent[]): User {
    const [first] = events;
    if (!(first instanceof UserRegisteredEvent)) {
      throw new InvalidUserException('o primeiro evento de um user precisa ser UserRegisteredEvent');
    }
    const user = Users.emptyFor(first.role);
    user.loadFromHistory([...events]);
    return user;
  },

  /** A instância vazia da classe que aquele papel pede. */
  emptyFor(role: string | null): User {
    return role === AUTHOR_ROLE ? new Author() : new Reader();
  },
};
