import { PostContent } from './post-content';
import { PostId } from './post-id';
import { POST_TITLE_MAX_LENGTH, PostTitle } from './post-title';

/**
 * Os value objects do Post, sozinhos.
 *
 * O que estes testes defendem é o que o `ValidatedDto.Scalar` promete e o resto do domínio assume sem
 * verificar: **um value object que existe é válido** (só o `parse` produz um), **normalização é do
 * schema** (o `trim` acontece na travessia, não em quem chama) e **a igualdade é por valor** — é
 * disso que dependem o `equals` do agregado, a chave estrangeira e o cursor de paginação.
 */
describe('value objects do Post', () => {
  const uuid = '0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10';

  describe('PostId', () => {
    it('generate produz um id novo e válido a cada chamada', () => {
      // Arrange / Act
      const first = PostId.generate();
      const second = PostId.generate();

      // Assert
      expect(PostId.safeParse(first.value).success).toBe(true);
      expect(first.equals(second)).toBe(false);
    });

    it('parse aceita um uuid e recusa qualquer outra coisa', () => {
      // Assert
      expect(PostId.parse(uuid).value).toBe(uuid);
      expect(PostId.safeParse('não-é-uuid').success).toBe(false);
      expect(PostId.safeParse('').success).toBe(false);
    });

    it('compara por valor, e não por instância — é o que o agregado assume', () => {
      // Arrange
      const fromDatabase = PostId.parse(uuid);
      const fromRequest = PostId.parse(uuid);

      // Assert
      expect(fromDatabase).not.toBe(fromRequest);
      expect(fromDatabase.equals(fromRequest)).toBe(true);
      expect(fromDatabase.equals(PostId.generate())).toBe(false);
    });

    it('atravessa protocolo e log como o texto cru', () => {
      // Arrange
      const id = PostId.parse(uuid);

      // Assert
      expect(String(id)).toBe(uuid);
      expect(id.toJSON()).toBe(uuid);
      expect(JSON.stringify({ id })).toBe(`{"id":"${uuid}"}`);
    });
  });

  describe('PostTitle', () => {
    it('normaliza pelo schema: o trim é da travessia, não de quem chama', () => {
      // Assert
      expect(PostTitle.parse('  Nest + GraphQL  ').value).toBe('Nest + GraphQL');
    });

    it('length responde sobre o valor já normalizado', () => {
      // Arrange
      const title = PostTitle.parse('  Nest  ');

      // Assert
      expect(title.length).toBe(4);
      expect(title.length).toBe(title.value.length);
    });

    it('recusa o vazio e o que passa do limite, com a mensagem do domínio', () => {
      // Assert
      expect(PostTitle.safeParse('   ').success).toBe(false);
      expect(() => PostTitle.parse('')).toThrow(/title não pode ser vazio/);
      expect(() => PostTitle.parse('x'.repeat(POST_TITLE_MAX_LENGTH + 1))).toThrow(
        new RegExp(`title excede ${POST_TITLE_MAX_LENGTH} caracteres`),
      );
    });

    it('aceita exatamente o limite — a borda é inclusiva', () => {
      // Assert
      expect(PostTitle.parse('x'.repeat(POST_TITLE_MAX_LENGTH)).length).toBe(POST_TITLE_MAX_LENGTH);
    });
  });

  describe('PostContent', () => {
    it('normaliza e recusa o vazio; comprimento é livre porque a coluna é TEXT', () => {
      // Assert
      expect(PostContent.parse('  oi  ').value).toBe('oi');
      expect(() => PostContent.parse('   ')).toThrow(/content não pode ser vazio/);
      expect(PostContent.parse('x'.repeat(10_000)).value).toHaveLength(10_000);
    });

    it('dois conteúdos com o mesmo texto são o mesmo valor', () => {
      // Assert
      expect(PostContent.parse('oi').equals(PostContent.parse(' oi '))).toBe(true);
      expect(PostContent.parse('oi').equals(PostContent.parse('tchau'))).toBe(false);
    });
  });
});
