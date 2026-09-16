import type { TestingModule } from '@nestjs/testing';
import {
  createCqrsTestingModule,
  freshEm,
  inRequestContext,
} from '../../../test/support/cqrs-testing-module';
import { FakeIdentityProvider } from '../../../test/support/fake-identity-provider';
import { AUTHOR_ROLE, User } from '../../domain/user/user.entity';
import { Author } from '../../domain/user/author.entity';
import { Reader } from '../../domain/user/reader.entity';
import { IdentityProvider } from '../../domain/user/identity.provider';
import { UnknownIdentityException } from '../../domain/user/exception/unknown-identity.exception';
import type { CredentialId } from '../../domain/user/vo/credential-id';
import { UserProvisioning } from './user-provisioning.service';

describe('UserProvisioning', () => {
  let module: TestingModule;
  let provisioning: UserProvisioning;
  let identities: FakeIdentityProvider;
  let credentialId: CredentialId;

  const EMAIL = 'manuel@example.com';

  const signUp = (role: string | null = null) => {
    credentialId = identities.signUp(EMAIL, 'Manuel', role);
    return credentialId;
  };

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

  it('outra credencial com o mesmo email reaproveita o perfil que já existe', async () => {
    const first = await provision();

    const other = identities.signUp(EMAIL, 'Manuel');
    const same = await provision(other);

    expect(same.id.equals(first.id)).toBe(true);
    expect(await freshEm(module).count(User)).toBe(1);
  });

  describe('promoção: encerrar um stream e abrir outro', () => {
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

    it('as duas linhas apontam uma para a outra, e as referências resolvem', async () => {
      const reader = await provision();
      const author = await promote();

      const em = freshEm(module);
      const closed = await em.findOneOrFail(User, { id: reader.id }, { filters: false });
      const opened = await em.findOneOrFail(User, { id: author.id });

      expect(closed.supersededBy?.id.equals(author.id)).toBe(true);
      expect(opened.supersedes?.id.equals(reader.id)).toBe(true);
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

    it('a mesma credencial passa a responder pelo perfil promovido', async () => {
      await provision();

      const author = await promote();

      const again = await provision();
      expect(again.id.equals(author.id)).toBe(true);
      expect(again).toBeInstanceOf(Author);
    });
  });

  describe('quando não há promoção a retomar', () => {
    it('uma promoção que terminou não é retomada, e o Author é reaproveitado', async () => {
      await provision();
      await identities.grantRole(credentialId, AUTHOR_ROLE);
      const author = await provision();
      const warn = vi.spyOn((provisioning as any).logger, 'warn').mockImplementation(() => undefined);

      const again = await provision();

      expect(again.id.equals(author.id)).toBe(true);
      expect(warn).not.toHaveBeenCalled();
      expect(await freshEm(module).count(User)).toBe(2);
      warn.mockRestore();
    });

    it('sem nenhuma promoção no histórico, o registro nasce com id novo e sem supersedes', async () => {
      signUp(AUTHOR_ROLE);

      const user = await provision();

      expect(user).toBeInstanceOf(Author);
      expect(user.supersedes ?? null).toBeNull();
      expect(await freshEm(module).count(User)).toBe(1);
    });
  });
});
