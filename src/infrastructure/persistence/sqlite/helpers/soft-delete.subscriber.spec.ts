import { BaseEntity, ChangeSetType, type FlushEventArgs } from '@mikro-orm/core';
import { WithSoftDelete } from '../../../../domain/shared/soft-delete';
import { SoftDeleteSubscriber } from './soft-delete.subscriber';

/**
 * O subscriber que troca um `DELETE` por um `UPDATE deleted_at`, exercitado como o que ele é: uma
 * função sobre changesets.
 *
 * Os testes de banco (`user-soft-delete.spec`, `soft-delete-filter.spec`) já provam o efeito no
 * caminho normal. O que só se alcança daqui são as duas decisões de borda, e as duas são silenciosas
 * quando erradas:
 *
 * - **`DELETE_EARLY`**, o tipo que a unidade de trabalho usa quando a linha removida precisa sair
 *   *antes* de um insert que colide com ela. Reclassificá-lo como `UPDATE` (e não `UPDATE_EARLY`)
 *   moveria a escrita para depois do insert, e a colisão que a ordem existia para evitar voltaria;
 * - **a entidade que o domínio já marcou**. Se o subscriber remarcasse, o instante gravado passaria a
 *   ser o dele, e não o que o agregado decidiu — o `deletedAt` deixaria de ser o do fato.
 *
 * Um `uow` de mentira basta: o subscriber lê os changesets e pede o recompute, e é isso.
 */
describe('SoftDeleteSubscriber', () => {
  class Apagavel extends WithSoftDelete(BaseEntity) {
    identity(): string {
      return 'apagável';
    }
  }
  /** Uma entidade que não herda o mixin: o subscriber não pode encostar nela. */
  class Comum {}

  const subscriber = new SoftDeleteSubscriber();

  /** O mínimo do `FlushEventArgs` que o subscriber usa. */
  const flushWith = (changeSets: Array<{ type: ChangeSetType; entity: unknown }>) => {
    const recomputed: unknown[] = [];
    const args = {
      uow: {
        getChangeSets: () => changeSets,
        recomputeSingleChangeSet: (entity: unknown) => recomputed.push(entity),
      },
    } as unknown as FlushEventArgs;
    return { args, recomputed };
  };

  it('um DELETE vira UPDATE, com a data marcada e o changeset recomputado', () => {
    // Arrange
    const entity = new Apagavel();
    const { args, recomputed } = flushWith([{ type: ChangeSetType.DELETE, entity }]);

    // Act
    subscriber.onFlush(args);

    // Assert
    expect(args.uow.getChangeSets()[0].type).toBe(ChangeSetType.UPDATE);
    expect(entity.isDeleted()).toBe(true);
    expect(recomputed).toEqual([entity]);
  });

  /**
   * O `DELETE_EARLY` existe para sair na frente de um insert que colidiria com a linha removida.
   * Virar `UPDATE` (e não `UPDATE_EARLY`) jogaria a escrita para depois desse insert.
   */
  it('um DELETE_EARLY vira UPDATE_EARLY, preservando a ordem que ele pedia', () => {
    // Arrange
    const entity = new Apagavel();
    const { args, recomputed } = flushWith([{ type: ChangeSetType.DELETE_EARLY, entity }]);

    // Act
    subscriber.onFlush(args);

    // Assert
    expect(args.uow.getChangeSets()[0].type).toBe(ChangeSetType.UPDATE_EARLY);
    expect(recomputed).toEqual([entity]);
  });

  /**
   * Quando o domínio já decidiu (`post.softDelete(now)`), o instante gravado tem de ser **o dele**.
   * O subscriber existe para o caminho de infraestrutura não contrariar o filtro, não para reescrever
   * o que o agregado registrou.
   */
  it('não remarca o que o domínio já apagou: o instante continua o do fato', () => {
    // Arrange
    const decididoEm = new Date('2026-01-01T00:00:00.000Z');
    const entity = new Apagavel();
    entity.applyDeletion(decididoEm);
    const { args } = flushWith([{ type: ChangeSetType.DELETE, entity }]);

    // Act
    subscriber.onFlush(args);

    // Assert
    expect(entity.deletedAt).toEqual(decididoEm);
    expect(args.uow.getChangeSets()[0].type).toBe(ChangeSetType.UPDATE);
  });

  it('um changeset que não é delete passa intocado', () => {
    // Arrange
    const entity = new Apagavel();
    const { args, recomputed } = flushWith([
      { type: ChangeSetType.CREATE, entity },
      { type: ChangeSetType.UPDATE, entity },
    ]);

    // Act
    subscriber.onFlush(args);

    // Assert
    expect(args.uow.getChangeSets().map((each) => each.type)).toEqual([
      ChangeSetType.CREATE,
      ChangeSetType.UPDATE,
    ]);
    expect(entity.isDeleted()).toBe(false);
    expect(recomputed).toEqual([]);
  });

  /** O marcador `SOFT_DELETABLE` é o que dá alcance ao subscriber; sem ele, o DELETE é um DELETE. */
  it('uma entidade que não herda o mixin continua sendo apagada de verdade', () => {
    // Arrange
    const { args, recomputed } = flushWith([{ type: ChangeSetType.DELETE, entity: new Comum() }]);

    // Act
    subscriber.onFlush(args);

    // Assert
    expect(args.uow.getChangeSets()[0].type).toBe(ChangeSetType.DELETE);
    expect(recomputed).toEqual([]);
  });

  it('um flush sem changeset nenhum não faz nada', () => {
    // Arrange
    const { args, recomputed } = flushWith([]);

    // Act / Assert
    expect(() => subscriber.onFlush(args)).not.toThrow();
    expect(recomputed).toEqual([]);
  });
});
