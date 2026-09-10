import { TagId } from './tag-id';
import { TAG_NAME_MAX_LENGTH, TagName } from './tag-name';

/** Os value objects da Tag. Mesmo contrato dos do Post — ver `post-vo.spec`. */
describe('value objects da Tag', () => {
  describe('TagId', () => {
    it('generate produz um uuid novo, e parse recusa o que não é', () => {
      // Arrange / Act
      const id = TagId.generate();

      // Assert
      expect(TagId.safeParse(id.value).success).toBe(true);
      expect(id.equals(TagId.generate())).toBe(false);
      expect(TagId.safeParse('untagged').success).toBe(false);
    });

    it('compara por valor e atravessa como texto', () => {
      // Arrange
      const uuid = '5f7a1c7e-4d0b-4b7a-9e3c-1a2b3c4d5e6f';

      // Assert
      expect(TagId.parse(uuid).equals(TagId.parse(uuid))).toBe(true);
      expect(String(TagId.parse(uuid))).toBe(uuid);
    });
  });

  describe('TagName', () => {
    it('normaliza, recusa o vazio e respeita o limite da coluna única', () => {
      // Assert
      expect(TagName.parse('  Untagged  ').value).toBe('Untagged');
      expect(() => TagName.parse('   ')).toThrow(/nome da tag não pode ser vazio/);
      expect(() => TagName.parse('x'.repeat(TAG_NAME_MAX_LENGTH + 1))).toThrow(
        new RegExp(`nome da tag excede ${TAG_NAME_MAX_LENGTH} caracteres`),
      );
      expect(TagName.parse('x'.repeat(TAG_NAME_MAX_LENGTH)).value).toHaveLength(TAG_NAME_MAX_LENGTH);
    });

    it('a igualdade é sensível a maiúsculas — a unicidade do banco também é', () => {
      // Assert
      expect(TagName.parse('dev').equals(TagName.parse(' dev '))).toBe(true);
      expect(TagName.parse('dev').equals(TagName.parse('Dev'))).toBe(false);
    });
  });
});
