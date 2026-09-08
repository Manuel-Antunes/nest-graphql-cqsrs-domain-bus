import { randomUUID } from 'node:crypto';
import { z } from 'zod';

/** Identidade da Tag — ver `PostId` para o porquê de um schema branded. */
export const TagId = z.uuid().brand<'TagId'>();
export type TagId = z.infer<typeof TagId>;

export const newTagId = (): TagId => TagId.parse(randomUUID());
