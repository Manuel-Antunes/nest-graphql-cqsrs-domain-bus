import { QueryBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import {
  createCqrsTestingModule,
  freshEm,
  inRequestContext,
} from '../../../../test/support/cqrs-testing-module';
import { givenAPost, givenATag } from '../../../../test/support/post-fixtures';
import { Post } from '../../../domain/post/post.entity';
import { PostId } from '../../../domain/post/vo/post-id';
import { FindPostQuery } from './find-post.query';

/**
 * A leitura de um Post pelo id, contra o banco de verdade.
 *
 * O handler é curto — delega ao repositório e devolve a entidade —, mas o que ele devolve é o que a
 * borda depende para montar a view, e isso não é óbvio: `tags` e `author` são **relações**, e o
 * `PostViewMapper` lê o nome do autor pelo `getEntity()`. Uma leitura sem `populate` compila, passa
 * num teste que só olhe o id, e estoura no primeiro `fromPost` — daí o teste afirmar as duas
 * relações e não só o achado.
 *
 * A outra decisão que ele fixa: não achar é `null`, não exceção. Quem transforma ausência em erro é
 * quem tem contexto para isso — o `createPost`, que acabou de gravar.
 */
describe('FindPostQuery.Handler', () => {
  let module: TestingModule;
  let queries: QueryBus;

  const execute = (postId: PostId) =>
    inRequestContext(module, () => queries.execute(new FindPostQuery.FindPost(postId)));

  beforeEach(async () => {
    module = await createCqrsTestingModule([FindPostQuery.Handler]);
    queries = module.get(QueryBus);
  });

  afterEach(() => module.close());

  it('devolve o Post gravado, e não uma cópia de leitura', async () => {
    // Arrange
    const post = await givenAPost(module, { title: 'Nest + GraphQL' });

    // Act
    const found = await execute(post.id);

    // Assert
    expect(found).toBeInstanceOf(Post);
    expect(found!.id.equals(post.id)).toBe(true);
    expect(found!.title.value).toBe('Nest + GraphQL');
  });

  /** É o `populate` do repositório: sem ele, a view não teria como perguntar o nome do autor. */
  it('vem com tags e autor populados, que é o que a borda precisa', async () => {
    // Arrange
    const tag = await givenATag(module, 'dev');
    const post = await givenAPost(module, { tags: [tag] });

    // Act
    const found = await execute(post.id);

    // Assert
    expect(found!.tags.isInitialized()).toBe(true);
    expect(found!.tags.getItems().map((each) => each.name.value)).toEqual(['dev']);
    expect(found!.author.getEntity().name.value).toBe('manuel');
  });

  it('um id que não existe é null, e não exceção', async () => {
    // Act / Assert
    expect(await execute(PostId.generate())).toBeNull();
  });

  it('um post apagado não é encontrado — o filtro de ativos vale para a leitura também', async () => {
    // Arrange
    const post = await givenAPost(module);
    const em = freshEm(module);
    const gravado = await em.findOneOrFail(Post, { id: post.id });
    gravado.softDelete(new Date());
    gravado.uncommit();
    await em.flush();

    // Act / Assert
    expect(await execute(post.id)).toBeNull();
  });

  it('a leitura não dispara evento nenhum: consultar não é um fato', async () => {
    // Arrange
    const post = await givenAPost(module);

    // Act
    const found = await execute(post.id);

    // Assert
    expect(found!.getUncommittedEvents()).toEqual([]);
  });
});
