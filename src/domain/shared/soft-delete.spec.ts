import { AlreadyDeletedException } from "./already-deleted.exception";
import { NotDeletedException } from "./not-deleted.exception";
import { SoftDeletion, WithSoftDelete } from "./soft-delete";

/**
 * O soft delete **do lado do domínio**: o value object e o mixin, sem ORM nenhum no meio.
 *
 * O efeito nas consultas — o filtro e o subscriber — é de infraestrutura, e está coberto em
 * `infrastructure/persistence/sqlite/entities/soft-delete-filter.spec` e `helpers/user-soft-delete.spec`.
 */
describe("soft delete", () => {
  const T0 = new Date("2026-09-08T12:00:00.000Z");
  const T1 = new Date("2026-09-08T12:01:00.000Z");

  describe("SoftDeletion: o value object embutido", () => {
    it("nasce vivo", () => {
      // Arrange / Act
      const state = SoftDeletion.alive();

      // Assert
      expect(state.isDeleted).toBe(false);
      expect(state.at()).toBeNull();
      expect(String(state)).toBe("vivo");
    });
  });

  /**
   * O mixin testado **sozinho**, sem Post, sem User, sem ORM — como o `SoftDeletableTest` da versão
   * Java. É o que justifica ele ser um mixin: o comportamento é testado uma vez, e as duas entidades
   * que o usam herdam o teste junto com o código.
   */
  describe("WithSoftDelete: o mixin, sozinho", () => {
    /** O mínimo que o mixin exige: uma identidade. Tudo o mais ele já traz. */
    class Thing extends WithSoftDelete(Object) {
      id = "coisa-1";
      override toString(): string {
        return this.id;
      }
    }

    it("nasce vivo", () => {
      // Arrange / Act / Assert
      expect(new Thing().isDeleted()).toBe(false);
      expect(new Thing().deletedAt).toBeNull();
    });

    it("softDelete registra o instante", () => {
      // Arrange
      const thing = new Thing();

      // Act
      thing.softDelete(T0);

      // Assert
      expect(thing.isDeleted()).toBe(true);
      expect(thing.deletedAt).toEqual(T0);
    });

    it("restore traz de volta", () => {
      // Arrange
      const thing = new Thing();
      thing.softDelete(T0);

      // Act
      thing.restore(T1);

      // Assert
      expect(thing.isDeleted()).toBe(false);
      expect(thing.deletedAt).toBeNull();
    });

    it("apagar duas vezes é recusado, e o instante original não é sobrescrito", () => {
      // Arrange
      const thing = new Thing();
      thing.softDelete(T0);

      // Act / Assert
      expect(() => thing.softDelete(T1)).toThrow(AlreadyDeletedException);
      expect(() => thing.softDelete(T1)).toThrow(/coisa-1/);
      expect(thing.deletedAt).toEqual(T0);
    });

    it("restaurar o que está vivo é recusado", () => {
      // Arrange / Act / Assert
      expect(() => new Thing().restore(T0)).toThrow(NotDeletedException);
      expect(() => new Thing().restore(T0)).toThrow(/coisa-1/);
    });

    it("evoluir não verifica nada — é o par que o replay usa", () => {
      // Arrange
      const thing = new Thing();

      // Act — o mesmo fato aplicado duas vezes, que é o que acontece entre decidir e reconstituir
      thing.applyDeletion(T0);
      thing.applyDeletion(T0);

      // Assert
      expect(thing.isDeleted()).toBe(true);
      expect(thing.deletedAt).toEqual(T0);
      thing.applyRestoration();
      thing.applyRestoration();
      expect(thing.isDeleted()).toBe(false);
    });
  });
});
