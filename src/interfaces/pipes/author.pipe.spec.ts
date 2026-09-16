import { NotAnAuthorException } from '../../domain/user/exception/not-an-author.exception';
import { Reader } from '../../domain/user/reader.entity';
import { AUTHOR_ROLE, User } from '../../domain/user/user.entity';
import { Author } from '../../domain/user/author.entity';
import { UserId } from '../../domain/user/vo/user-id';
import { AuthorPipe } from './author.pipe';

/**
 * O upcast da borda, testado onde ele agora mora.
 *
 * Antes isto era um `requireAuthor` privado dentro do `PostMutationResolver` — testável só subindo um
 * resolver inteiro. Como pipe, ele é uma classe sem dependência nenhuma: o teste é o que a regra é.
 */
describe('AuthorPipe', () => {
  const pipe = new AuthorPipe();
  const now = new Date('2026-09-08T12:00:00.000Z');

  const anEmail = () => `x+${UserId.generate()}@example.com`;
  const anAuthor = (): User =>
    Author.register(UserId.generate(), { email: anEmail(), name: 'manuel' }, AUTHOR_ROLE, now);
  const aReader = (): User =>
    Reader.register(UserId.generate(), { email: anEmail(), name: 'manuel' }, null, now);

  it('deixa passar um Author, e o tipo que sai é Author', () => {
    // Arrange
    const user = anAuthor();

    // Act
    const author = pipe.transform(user);

    // Assert
    expect(author).toBeInstanceOf(Author);
    expect(author).toBe(user);
  });

  it('recusa um Reader', () => {
    // Arrange
    const reader = aReader();

    // Act / Assert
    expect(() => pipe.transform(reader)).toThrow(NotAnAuthorException);
  });

  it('a recusa nomeia o usuário — quem recebe a mensagem é o dono da sessão', () => {
    // Arrange
    const reader = aReader();

    // Act / Assert
    expect(() => pipe.transform(reader)).toThrow(new RegExp(String(reader.id)));
  });
});
