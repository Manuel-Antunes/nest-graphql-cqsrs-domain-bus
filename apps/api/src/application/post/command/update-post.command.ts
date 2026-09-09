import { Command } from '@nestjs/cqrs';
import type { PostId } from '../../../domain/post/vo/post-id';

/**
 * Command: atualizar título e/ou conteúdo de um Post. Campos `null`/ausentes significam "manter o
 * valor atual" — quem sabe qual é o valor atual é a entidade, então o command só carrega a intenção.
 */
export class UpdatePostCommand extends Command<void> {
  constructor(
    readonly postId: PostId,
    readonly title?: string | null,
    readonly content?: string | null,
  ) {
    super();
  }
}
