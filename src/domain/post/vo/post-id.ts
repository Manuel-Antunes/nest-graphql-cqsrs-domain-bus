import { randomUUID } from 'node:crypto';
import { z } from 'zod';

/**
 * Identidade do Post. Value object como schema Zod *branded*: um `PostId` só existe depois de passar
 * pelo `parse`, então quem recebe um `PostId` tipado recebe um valor que já foi validado — o mesmo
 * papel do construtor canônico do `record` em Java, sem uma classe para isso.
 */
export const PostId = z.uuid().brand<'PostId'>();
export type PostId = z.infer<typeof PostId>;

/** Construtor nomeado: `newPostId()` vs `PostId.parse(...)` dizem no call site qual dos dois casos é. */
export const newPostId = (): PostId => PostId.parse(randomUUID());
