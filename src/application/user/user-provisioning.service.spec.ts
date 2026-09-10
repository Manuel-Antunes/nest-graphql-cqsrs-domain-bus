import type { TestingModule } from '@nestjs/testing';
import {
  createCqrsTestingModule,
  freshEm,
  inRequestContext,
} from '../../../test/support/cqrs-testing-module';
import { FakeIdentityProvider } from '../../../test/support/fake-identity-provider';
import { Author } from '../../domain/user/author.entity';
import { IdentityProvider } from '../../domain/user/identity.provider';
import { Reader } from '../../domain/user/reader.entity';
import { UnknownIdentityException } from '../../domain/user/exception/unknown-identity.exception';
import { AUTHOR_ROLE, User } from '../../domain/user/user.entity';
import type { CredentialId } from '../../domain/user/vo/credential-id';
import { UserProvisioning } from './user-provisioning.service';

/**
 * O provisionamento contra o banco de verdade e um provedor de identidade **falso** — e,
 * principalmente, a **promoção**.
 *
 * Ela é a sequência mais delicada do agregado: encerrar um stream e abrir outro com o mesmo email.
 * E desde que `supersededBy`/`supersedes` viraram relacionamentos, ela também é a única operação do
 * sistema que grava **duas linhas que apontam uma para a outra** — o que a chave estrangeira agora
 * arbitra. Sem este teste, a ordem de gravação seria uma suposição.
 *
 * O provedor falso é o que a porta comprou: nenhum destes testes importa `better-auth`, e o serviço
 * não nota a diferença. Ver {@link FakeIdentityProvider}.
 */
describe('UserProvisioning', () => {
  let module: TestingModule;
  let provisioning: UserProvisioning;
  let identities: FakeIdentityProvider;
  let credentialId: CredentialId;

  const EMAIL = 'manuel@example.com';

  /** Registra a credencial no provedor, como um sign-up faria. */
  const signUp = (role: string | null = null) => {
    credentialId = identities.signUp(EMAIL, 'Manuel', role);
    return credentialId;
  };

  /**
   * Um `provision` = **uma requisição**.
   *
   * O contexto do ORM nasce na borda (o middleware que o `MikroOrmModule.forRoot` registra), e não
   * num `@CreateRequestContext()` por método. Num teste não há requisição HTTP, então a borda é
   * isto — e chamar duas vezes é o que de fato acontece: dois acessos, dois contextos, e o segundo
   * enxerga o que o primeiro gravou.
   */
  const provision = (id: CredentialId = credentialId) =>
    inRequestContext(module, () => provisioning.provision(id));

  beforeEach(async () => {
    identities = new FakeIdentityProvider();
    module = await createCqrsTestingModule([
      UserProvisioning,
      { provide: IdentityProvider, useValue: identities },
    ]);
    provisioning = module.get(UserProvisioning);
    signUp();
  });

  afterEach(() => module.close());

  it('o primeiro acesso cria o perfil de domínio', async () => {
    const user = await provision();

    expect(user).toBeInstanceOf(Reader);
    expect(user.email.value).toBe(EMAIL);
    expect(await freshEm(module).count(User)).toBe(1);
  });

  it('o segundo acesso reaproveita o perfil, não cria outro', async () => {
    const first = await provision();

    const second = await provision();

    expect(second.id.equals(first.id)).toBe(true);
    expect(await freshEm(module).count(User)).toBe(1);
  });

  it('quem chega já como author nasce Author', async () => {
    signUp(AUTHOR_ROLE);

    const user = await provision();

    expect(user).toBeInstanceOf(Author);
    expect(user.canWritePosts()).toBe(true);
  });

  it('uma credencial que o provedor não conhece não vira perfil', async () => {
    identities.forget(credentialId);

    await expect(provision()).rejects.toBeInstanceOf(UnknownIdentityException);
    expect(await freshEm(module).count(User)).toBe(0);
  });

  /**
   * A ligação de contas por **email** — que agora acontece em dois lugares, e é bom saber qual é
   * qual. Do lado do provedor, o `account.accountLinking` prende uma credencial nova à identidade
   * que já existe. Do lado daqui, uma identidade cujo email já tem perfil reaproveita esse perfil.
   * O segundo é o que este teste cobre, e é o que garante que trocar a origem da credencial não
   * cria uma segunda pessoa — com outros posts e outras subscriptions.
   */
  it('outra credencial com o mesmo email reaproveita o perfil que já existe', async () => {
    const first = await provision();

    const other = identities.signUp(EMAIL, 'Manuel');
    const same = await provision(other);

    expect(same.id.equals(first.id)).toBe(true);
    expect(await freshEm(module).count(User)).toBe(1);
  });

  describe('promoção: encerrar um stream e abrir outro', () => {
    /** O papel muda **no provedor** — é de lá que a promoção nasce. */
    const promote = async () => {
      await identities.grantRole(credentialId, AUTHOR_ROLE);
      return provision();
    };

    it('promove um Reader a Author, gravando as duas linhas', async () => {
      const reader = await provision();

      const author = await promote();

      expect(author).toBeInstanceOf(Author);
      expect(author.id.equals(reader.id)).toBe(false);
      expect(await freshEm(module).count(User)).toBe(2);
    });

    /**
     * O que a chave estrangeira passou a garantir: o `superseded_by` do stream encerrado aponta para
     * uma linha que **existe**. Antes, com um `UserId` solto, nada impedia apontar para o vazio.
     */
    it('as duas linhas apontam uma para a outra, e as referências resolvem', async () => {
      const reader = await provision();
      const author = await promote();

      const em = freshEm(module);
      const closed = await em.findOneOrFail(User, { id: reader.id }, { filters: false });
      const opened = await em.findOneOrFail(User, { id: author.id });

      expect(closed.supersededBy?.id.equals(author.id)).toBe(true);
      expect(opened.supersedes?.id.equals(reader.id)).toBe(true);
      // a referência é para a raiz abstrata, mas o que volta é o tipo concreto
      expect(await closed.supersededBy!.load()).toBeInstanceOf(Author);
      expect(await opened.supersedes!.load()).toBeInstanceOf(Reader);
    });

    it('o stream encerrado deixa de contar como ativo', async () => {
      const reader = await provision();
      await promote();

      const closed = await freshEm(module).findOneOrFail(User, { id: reader.id }, { filters: false });

      expect(closed.isActive()).toBe(false);
      expect(closed).toBeInstanceOf(Reader);
    });

    it('depois de promovido, o acesso seguinte reaproveita o Author', async () => {
      await provision();
      const author = await promote();

      const again = await provision();

      expect(again.id.equals(author.id)).toBe(true);
      expect(await freshEm(module).count(User)).toBe(2);
    });

    /**
     * A credencial **não** é recriada na promoção: é a mesma pessoa, com a mesma senha. O que a liga
     * ao perfil novo é o email, que a promoção preserva — o stream encerrado deixa de ser ativo, e
     * `findActiveByEmail` passa a achar o `Author`. É por isso que a requisição seguinte, com o
     * mesmo cookie de sempre, já entra como autor.
     */
    it('a mesma credencial passa a responder pelo perfil promovido', async () => {
      await provision();

      const author = await promote();

      const again = await provision();
      expect(again.id.equals(author.id)).toBe(true);
      expect(again).toBeInstanceOf(Author);
    });
  });

  /**
   * A janela de falha da promoção — e o que dá para afirmar sobre ela hoje.
   *
   * O `pendingPromotionId` existe para detectar um stream encerrado cujo sucessor não existe e
   * **retomar aquele id**. Os testes abaixo cobrem os dois casos em que ele decide *não* retomar,
   * que são os que de fato acontecem:
   *
   * - a promoção terminou (o sucessor está lá) — nada a retomar;
   * - nunca houve promoção — o registro é comum.
   *
   * O terceiro caso, o do órfão de verdade, **não é alcançável neste schema**: `supersededBy` é um
   * `manyToOne` para a raiz abstrata da herança multi-tabela, então o ORM precisa do join para saber
   * se aquela linha é `Reader` ou `Author` — e, sem a linha do sucessor, a propriedade hidrata como
   * `null` em vez de uma referência pendurada. A guarda que abre a retomada (`if (!orphan?.supersededBy)`)
   * vê `null` exatamente no cenário que ela deveria detectar. Somado a isso, a FK do sucessor é
   * `ON DELETE SET NULL` e o `saveAll` grava os dois numa transação só. Não há teste aqui para esse
   * caminho porque não há como chegar nele sem forjar um estado impossível.
   */
  describe('quando não há promoção a retomar', () => {
    /**
     * Uma promoção que terminou deixa o `supersededBy` anotado do mesmo jeito que uma interrompida —
     * o que separa as duas é o sucessor existir. Confundi-las criaria um perfil novo a cada login.
     */
    it('uma promoção que terminou não é retomada, e o Author é reaproveitado', async () => {
      // Arrange
      await provision();
      await identities.grantRole(credentialId, AUTHOR_ROLE);
      const author = await provision();
      const warn = vi.spyOn((provisioning as any).logger, 'warn').mockImplementation(() => undefined);

      // Act
      const again = await provision();

      // Assert
      expect(again.id.equals(author.id)).toBe(true);
      expect(warn).not.toHaveBeenCalled();
      expect(await freshEm(module).count(User)).toBe(2);
      warn.mockRestore();
    });

    it('sem nenhuma promoção no histórico, o registro nasce com id novo e sem supersedes', async () => {
      // Arrange
      signUp(AUTHOR_ROLE);

      // Act
      const user = await provision();

      // Assert
      expect(user).toBeInstanceOf(Author);
      expect(user.supersedes ?? null).toBeNull();
      expect(await freshEm(module).count(User)).toBe(1);
    });
  });
});
