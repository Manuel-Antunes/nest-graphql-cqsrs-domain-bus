import type { FlushEventArgs } from '@mikro-orm/core';
import { BaseEntity, ChangeSetType } from '@mikro-orm/core';

import { WithSoftDelete } from '../../../domain/shared/soft-delete/soft-delete';
import { SoftDeleteSubscriber } from './soft-delete.subscriber';

describe('SoftDeleteSubscriber', () => {
  class Apagavel extends WithSoftDelete(BaseEntity) {
    identity(): string {
      return 'apagável';
    }
  }
  class Comum {}

  const subscriber = new SoftDeleteSubscriber();

  const flushWith = (
    changeSets: Array<{ type: ChangeSetType; entity: unknown }>,
  ) => {
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
    const entity = new Apagavel();
    const { args, recomputed } = flushWith([
      { type: ChangeSetType.DELETE, entity },
    ]);

    subscriber.onFlush(args);

    expect(args.uow.getChangeSets()[0].type).toBe(ChangeSetType.UPDATE);
    expect(entity.isDeleted()).toBe(true);
    expect(recomputed).toEqual([entity]);
  });

  it('um DELETE_EARLY vira UPDATE_EARLY, preservando a ordem que ele pedia', () => {
    const entity = new Apagavel();
    const { args, recomputed } = flushWith([
      { type: ChangeSetType.DELETE_EARLY, entity },
    ]);

    subscriber.onFlush(args);

    expect(args.uow.getChangeSets()[0].type).toBe(ChangeSetType.UPDATE_EARLY);
    expect(recomputed).toEqual([entity]);
  });

  it('não remarca o que o domínio já apagou: o instante continua o do fato', () => {
    const decididoEm = new Date('2026-01-01T00:00:00.000Z');
    const entity = new Apagavel();
    entity.applyDeletion(decididoEm);
    const { args } = flushWith([{ type: ChangeSetType.DELETE, entity }]);

    subscriber.onFlush(args);

    expect(entity.deletedAt).toEqual(decididoEm);
    expect(args.uow.getChangeSets()[0].type).toBe(ChangeSetType.UPDATE);
  });

  it('um changeset que não é delete passa intocado', () => {
    const entity = new Apagavel();
    const { args, recomputed } = flushWith([
      { type: ChangeSetType.CREATE, entity },
      { type: ChangeSetType.UPDATE, entity },
    ]);

    subscriber.onFlush(args);

    expect(args.uow.getChangeSets().map((each) => each.type)).toEqual([
      ChangeSetType.CREATE,
      ChangeSetType.UPDATE,
    ]);
    expect(entity.isDeleted()).toBe(false);
    expect(recomputed).toEqual([]);
  });

  it('uma entidade que não herda o mixin continua sendo apagada de verdade', () => {
    const { args, recomputed } = flushWith([
      { type: ChangeSetType.DELETE, entity: new Comum() },
    ]);

    subscriber.onFlush(args);

    expect(args.uow.getChangeSets()[0].type).toBe(ChangeSetType.DELETE);
    expect(recomputed).toEqual([]);
  });

  it('um flush sem changeset nenhum não faz nada', () => {
    const { args, recomputed } = flushWith([]);

    expect(() => subscriber.onFlush(args)).not.toThrow();
    expect(recomputed).toEqual([]);
  });
});
