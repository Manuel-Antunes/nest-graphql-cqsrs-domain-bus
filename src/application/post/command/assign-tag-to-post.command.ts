import { Command } from '@nestjs/cqrs';
import type { PostId } from '../../../domain/post/vo/post-id';
import type { TagId } from '../../../domain/tag/vo/tag-id';

/**
 * Command: assinalar uma Tag existente a um Post. Carrega os dois ids; o handler carrega a Tag para
 * copiar o nome dela para dentro do Post (`TagRef`), porque agregado referencia agregado por identidade.
 */
export class AssignTagToPostCommand extends Command<void> {
  constructor(
    readonly postId: PostId,
    readonly tagId: TagId,
  ) {
    super();
  }
}
