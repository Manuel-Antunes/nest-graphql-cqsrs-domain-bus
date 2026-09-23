import { AlreadyDeletedException } from './already-deleted.exception';
import { NotDeletedException } from './not-deleted.exception';
import { SoftDeletion, WithSoftDelete } from './soft-delete';

describe('soft delete', () => {
  const T0 = new Date('2026-09-08T12:00:00.000Z');
  const T1 = new Date('2026-09-08T12:01:00.000Z');

  describe('SoftDeletion: o value object embutido', () => {
    it('nasce vivo', () => {
      const state = SoftDeletion.alive();

      expect(state.isDeleted).toBe(false);
      expect(state.at()).toBeNull();
      expect(String(state)).toBe('vivo');
    });
  });

  describe('WithSoftDelete: o mixin, sozinho', () => {
    class Thing extends WithSoftDelete(Object) {
      id = 'coisa-1';
      override toString(): string {
        return this.id;
      }
    }

    it('nasce vivo', () => {
      expect(new Thing().isDeleted()).toBe(false);
      expect(new Thing().deletedAt).toBeNull();
    });

    it('softDelete registra o instante', () => {
      const thing = new Thing();

      thing.softDelete(T0);

      expect(thing.isDeleted()).toBe(true);
      expect(thing.deletedAt).toEqual(T0);
    });

    it('restore traz de volta', () => {
      const thing = new Thing();
      thing.softDelete(T0);

      thing.restore(T1);

      expect(thing.isDeleted()).toBe(false);
      expect(thing.deletedAt).toBeNull();
    });

    it('apagar duas vezes é recusado, e o instante original não é sobrescrito', () => {
      const thing = new Thing();
      thing.softDelete(T0);

      expect(() => thing.softDelete(T1)).toThrow(AlreadyDeletedException);
      expect(() => thing.softDelete(T1)).toThrow(/coisa-1/);
      expect(thing.deletedAt).toEqual(T0);
    });

    it('restaurar o que está vivo é recusado', () => {
      expect(() => new Thing().restore(T0)).toThrow(NotDeletedException);
      expect(() => new Thing().restore(T0)).toThrow(/coisa-1/);
    });

    it('evoluir não verifica nada — é o par que o replay usa', () => {
      const thing = new Thing();

      thing.applyDeletion(T0);
      thing.applyDeletion(T0);

      expect(thing.isDeleted()).toBe(true);
      expect(thing.deletedAt).toEqual(T0);
      thing.applyRestoration();
      thing.applyRestoration();
      expect(thing.isDeleted()).toBe(false);
    });
  });
});
