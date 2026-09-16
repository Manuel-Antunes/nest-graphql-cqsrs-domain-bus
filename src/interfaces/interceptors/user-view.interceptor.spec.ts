import type { Mapper, ModelIdentifier } from '@automapper/core';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { AUTHOR_ROLE, User } from '../../domain/user/user.entity';
import { Author } from '../../domain/user/author.entity';
import { Reader } from '../../domain/user/reader.entity';
import { UserId } from '../../domain/user/vo/user-id';
import { AuthorView, ReaderView } from '../../dto/graphql/user.view';
import { UserViewInterceptor } from './user-view.interceptor';

/**
 * O despacho polimórfico de `me`.
 *
 * O que se afirma não é que os campos atravessam — isso é do `UserProfile`. É que o **par certo** foi
 * escolhido: as duas views têm exatamente os mesmos campos, e a única diferença entre elas é a classe,
 * que é o que o `__resolveType` lê para decidir se o cliente pode pedir `... on Author { posts }`.
 *
 * Daí o teste espiar os identificadores em vez de conferir o resultado: um despacho errado produziria
 * uma view com todos os campos certos e o tipo errado, e nenhuma asserção sobre campos o veria.
 */
describe('UserViewInterceptor', () => {
  const now = new Date('2026-09-08T12:00:00.000Z');

  const mapperSpy = () => {
    const dispatched: Array<[ModelIdentifier, ModelIdentifier]> = [];
    const mapper = {
      mapAsync: (_source: unknown, from: ModelIdentifier, to: ModelIdentifier) => {
        dispatched.push([from, to]);
        return Promise.resolve({ to });
      },
    } as unknown as Mapper;
    return { mapper, dispatched };
  };

  const intercept = async (user: User) => {
    const { mapper, dispatched } = mapperSpy();
    const next: CallHandler<User> = { handle: () => of(user) };
    await lastValueFrom(
      new UserViewInterceptor(mapper).intercept({} as ExecutionContext, next as CallHandler),
    );
    return dispatched;
  };

  const anAuthor = (): User =>
    Author.register(UserId.generate(), { email: 'quem@example.com', name: 'quem' }, AUTHOR_ROLE, now);
  const aReader = (): User =>
    Reader.register(UserId.generate(), { email: 'quem@example.com', name: 'quem' }, null, now);

  it('um autor é mapeado como Author → AuthorView', async () => {
    // Arrange
    const author = anAuthor();
    expect(author).toBeInstanceOf(Author);

    // Act
    const dispatched = await intercept(author);

    // Assert
    expect(dispatched).toEqual([[Author, AuthorView]]);
  });

  it('quem não escreve é mapeado como Reader → ReaderView', async () => {
    // Arrange
    const reader = aReader();
    expect(reader).toBeInstanceOf(Reader);

    // Act
    const dispatched = await intercept(reader);

    // Assert
    expect(dispatched).toEqual([[Reader, ReaderView]]);
  });

  /**
   * A pergunta é do domínio, não da borda: quem responde é `canWritePosts()`, o mesmo predicado que o
   * `AuthorPipe` usa para recusar. Se a triagem passasse a ser um `instanceof` escrito aqui, ela
   * deixaria de acompanhar o domínio quando ele mudar de ideia.
   */
  it('a triagem é a que o agregado publica, e não uma reimplementada aqui', async () => {
    // Arrange: um usuário que diz saber escrever, sem ser um Author de verdade
    const user = aReader();
    vi.spyOn(user, 'canWritePosts').mockReturnValue(true as never);

    // Act
    const dispatched = await intercept(user);

    // Assert
    expect(dispatched).toEqual([[Author, AuthorView]]);
  });
});
