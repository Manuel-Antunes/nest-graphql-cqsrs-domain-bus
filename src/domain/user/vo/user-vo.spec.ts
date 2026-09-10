import { Email } from './email';
import { UserId } from './user-id';
import { UserName } from './user-name';

/**
 * Os value objects do User.
 *
 * O {@link Email} carrega mais peso do que os outros: ele é a **chave de ligação de contas** do
 * `UserProvisioning`, e a normalização dele (trim + lowercase) é o que faz `Manuel@X.com` e
 * `manuel@x.com` acharem o mesmo perfil. Se o `equals` mentisse aqui, o mesmo humano nasceria duas
 * vezes — e é isso que os testes abaixo prendem.
 */
describe('value objects do User', () => {
  describe('Email', () => {
    it('normaliza para minúsculas e sem espaços — é o que liga a conta ao perfil', () => {
      // Assert
      expect(Email.parse('  Manuel@Example.COM  ').value).toBe('manuel@example.com');
    });

    it('duas grafias do mesmo endereço são o mesmo valor', () => {
      // Assert
      expect(Email.parse('Manuel@Example.com').equals(Email.parse('manuel@example.com'))).toBe(true);
      expect(Email.parse('manuel@example.com').equals(Email.parse('outro@example.com'))).toBe(false);
    });

    it('domain devolve o que vem depois do @, já normalizado', () => {
      // Assert
      expect(Email.parse('Manuel@Example.COM').domain).toBe('example.com');
      expect(Email.parse('a@b.co.uk').domain).toBe('b.co.uk');
    });

    it('recusa o que não é endereço', () => {
      // Assert
      expect(Email.safeParse('manuel').success).toBe(false);
      expect(Email.safeParse('manuel@').success).toBe(false);
      expect(() => Email.parse('@example.com')).toThrow(/email inválido/);
    });
  });

  describe('UserId', () => {
    it('generate produz um uuid novo a cada chamada', () => {
      // Arrange / Act
      const id = UserId.generate();

      // Assert
      expect(UserId.safeParse(id.value).success).toBe(true);
      expect(id.equals(UserId.generate())).toBe(false);
    });

    it('compara por valor e atravessa como texto', () => {
      // Arrange
      const uuid = '9f1d1f36-7c2e-4a0a-9b7d-2f5c1a3e4b60';

      // Assert
      expect(UserId.parse(uuid).equals(UserId.parse(uuid))).toBe(true);
      expect(String(UserId.parse(uuid))).toBe(uuid);
      expect(UserId.safeParse('9f1d1f36').success).toBe(false);
    });
  });

  describe('UserName', () => {
    it('normaliza, recusa o vazio e limita a 100 caracteres', () => {
      // Assert
      expect(UserName.parse('  Manuel  ').value).toBe('Manuel');
      expect(() => UserName.parse('   ')).toThrow(/name não pode ser vazio/);
      expect(() => UserName.parse('x'.repeat(101))).toThrow(/name excede 100 caracteres/);
      expect(UserName.parse('x'.repeat(100)).value).toHaveLength(100);
    });
  });
});
