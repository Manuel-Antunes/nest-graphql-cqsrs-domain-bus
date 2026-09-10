import { AUTHOR_ROLE } from '../../domain/user/user.entity';
import { Users } from '../../domain/user/user.factory';
import { AuthorView, ReaderView } from '../../dto/graphql/user.view';
import { UserId } from '../../domain/user/vo/user-id';
import { UserViewMapper } from './user-view.mapper';

/**
 * O despacho polimórfico da borda: a mesma referência `User` vira uma view ou a outra conforme o tipo
 * concreto. É a parte do `me` que não é tradução de campos — e é por isso que este mapper é escrito à
 * mão.
 *
 * Nenhum ORM no meio: quem decide a classe é `Users.register`, a partir do papel, exatamente como
 * decide no provisionamento.
 */
describe('UserViewMapper', () => {
  const mapper = new UserViewMapper();
  const now = new Date('2026-09-08T12:00:00.000Z');

  const userWith = (role: string | null) =>
    Users.register(UserId.generate(), { email: 'Manuel@Example.com', name: '  manuel  ' }, role, now);

  it('um Author vira AuthorView — e é a classe que o diz, não um campo', () => {
    const view = mapper.fromUser(userWith(AUTHOR_ROLE));

    expect(view).toBeInstanceOf(AuthorView);
    expect(view).not.toBeInstanceOf(ReaderView);
  });

  it('qualquer outro papel vira ReaderView, papel nenhum incluído', () => {
    for (const role of [null, 'admin', 'leitor']) {
      const view = mapper.fromUser(userWith(role));

      expect(view).toBeInstanceOf(ReaderView);
      expect(view).not.toBeInstanceOf(AuthorView);
    }
  });

  /**
   * Os três campos saem da entidade já carregada — nenhum deles deve uma consulta. E saem como value
   * objects: normalizados pelo domínio (o email em minúsculas, o nome sem espaços), não como o texto
   * cru que alguém digitou.
   */
  it('carrega os três campos da interface, já como value objects do domínio', () => {
    const user = userWith(AUTHOR_ROLE);

    const view = mapper.fromUser(user);

    expect(view.id.equals(user.id)).toBe(true);
    expect(view.email.value).toBe('manuel@example.com');
    expect(view.name.value).toBe('manuel');
  });

  /**
   * `fromAuthor` é a porta para quem **já sabe** o tipo: o `Post.author` do schema é `Author!`, e a chave
   * estrangeira `posts.author_id → authors.id` já garantiu isso. Passar pelo despacho ali seria desfazer
   * o que o chamador sabe — e devolver `UserView` o obrigaria a um cast.
   */
  it('fromAuthor devolve AuthorView sem passar pelo despacho', () => {
    const author = userWith(AUTHOR_ROLE);
    if (!author.canWritePosts()) {
      throw new Error('AUTHOR_ROLE precisa nascer Author');
    }

    const view = mapper.fromAuthor(author);

    expect(view).toBeInstanceOf(AuthorView);
    expect(view.id.equals(author.id)).toBe(true);
    expect(view.email.value).toBe('manuel@example.com');
  });

  /** Os dois caminhos têm de concordar: o despacho de um Author chega ao mesmo lugar que `fromAuthor`. */
  it('fromUser de um Author e fromAuthor dão a mesma view', () => {
    const author = userWith(AUTHOR_ROLE);
    if (!author.canWritePosts()) {
      throw new Error('AUTHOR_ROLE precisa nascer Author');
    }

    expect({ ...mapper.fromUser(author) }).toEqual({ ...mapper.fromAuthor(author) });
  });

  /** `canWritePosts()` é `this is Author`: a borda usa a triagem do domínio em vez de refazer uma. */
  it('a triagem é a do domínio, e não um instanceof da borda', () => {
    const author = userWith(AUTHOR_ROLE);
    const reader = userWith(null);

    expect(author.canWritePosts()).toBe(true);
    expect(reader.canWritePosts()).toBe(false);
    expect(mapper.fromUser(author)).toBeInstanceOf(AuthorView);
    expect(mapper.fromUser(reader)).toBeInstanceOf(ReaderView);
  });
});
