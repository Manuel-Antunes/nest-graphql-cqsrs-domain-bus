import type { EventSubscriber, FlushEventArgs } from '@mikro-orm/core';
import { ChangeSetType, MikroORM } from '@mikro-orm/core';
import type { OnModuleInit } from '@nestjs/common';
import { Inject, Injectable, Optional } from '@nestjs/common';

import { SoftDeletion } from '../../../domain/shared/soft-delete/soft-delete';

@Injectable()
export class SoftDeleteSubscriber implements EventSubscriber, OnModuleInit {
  constructor(@Optional() @Inject(MikroORM) private readonly orm?: MikroORM) {}

  onModuleInit(): void {
    this.orm?.em.getEventManager().registerSubscriber(this);
  }

  onFlush(args: FlushEventArgs): void {
    for (const changeSet of args.uow.getChangeSets()) {
      const isDelete =
        changeSet.type === ChangeSetType.DELETE ||
        changeSet.type === ChangeSetType.DELETE_EARLY;
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
