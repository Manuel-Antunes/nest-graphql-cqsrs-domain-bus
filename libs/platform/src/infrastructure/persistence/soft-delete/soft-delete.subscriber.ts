import { type EventSubscriber, type FlushEventArgs, ChangeSetType } from '@mikro-orm/core';
import { SoftDeletion } from '../../../domain/shared/soft-delete/soft-delete';

export class SoftDeleteSubscriber implements EventSubscriber {
  onFlush(args: FlushEventArgs): void {
    for (const changeSet of args.uow.getChangeSets()) {
      const isDelete =
        changeSet.type === ChangeSetType.DELETE || changeSet.type === ChangeSetType.DELETE_EARLY;
      if (!isDelete || !SoftDeletion.isSoftDeletable(changeSet.entity)) {
        continue;
      }

      if (!changeSet.entity.isDeleted()) {
        changeSet.entity.applyDeletion(new Date());
      }
      changeSet.type =
        changeSet.type === ChangeSetType.DELETE_EARLY
          ? ChangeSetType.UPDATE_EARLY
          : ChangeSetType.UPDATE;
      args.uow.recomputeSingleChangeSet(changeSet.entity);
    }
  }
}
