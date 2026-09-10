/**
 * Alguém tentou mexer num Post que não escreveu.
 *
 * É a metade **de domínio** da autorização de escrita, e ela existe separada da guarda de borda de
 * propósito: ter `ROLE_AUTHOR` responde "esta pessoa pode escrever posts?"; ser o autor daquele post
 * responde "pode escrever *este*?". A primeira é do protocolo e vive num guard; a segunda é invariante
 * do agregado e vive aqui — então vale para qualquer caminho que chegue ao Post, inclusive um command
 * despachado por uma saga, que nunca passa por guard nenhum.
 */
import type { UserId } from '../../user/vo/user-id';
import type { PostId } from '../vo/post-id';

export class PostNotWrittenByException extends Error {
  constructor(
    readonly postId: PostId,
    readonly userId: UserId,
  ) {
    super(`post ${postId} não foi escrito por ${userId}`);
    this.name = 'PostNotWrittenByException';
  }
}
