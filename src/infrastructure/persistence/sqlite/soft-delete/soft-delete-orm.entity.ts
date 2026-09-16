import { defineEntity, p } from '@mikro-orm/core';
import { SoftDeletion } from '../../../../domain/shared/soft-delete/soft-delete';

export const ACTIVE_FILTER = 'active';

export const SoftDeletionSchema = defineEntity({
  class: SoftDeletion,
  embeddable: true,
  properties: {
    deletedAt: p.datetime().nullable(),
  },
});

export const softDeleteProperty = () => p.embedded(SoftDeletionSchema).prefix(false).object(false);

export const softDeleteIndex = { properties: ['deleted.deletedAt'] } as { properties: never };

export const activeFilter = {
  [ACTIVE_FILTER]: {
    name: ACTIVE_FILTER,
    cond: { deleted: { deletedAt: null } },
    default: true,
  },
};
