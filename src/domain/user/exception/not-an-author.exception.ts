import type { UserId } from '../vo/user-id';

/**
 * O usuário existe, mas não é um {@link Author} — então não escreve posts.
 *
 * ## Duas formas, de propósito
 * **Com id**, é a guarda da borda: o resolver já tem o perfil de domínio de quem está autenticado, e
 * `canWritePosts()` (que é `this is Author`) responde antes de qualquer command sair. A mensagem pode
 * nomear o usuário porque quem a recebe é ele mesmo.
 *
 * **Sem id**, é o que a violação da chave estrangeira `posts.author_id → authors.id` vira quando
 * traduzida. A mensagem é vaga **de propósito**: a FK dispara tanto para um id inexistente quanto para
 * um id de leitor, e distinguir os dois transformaria a recusa num oráculo de quais usuários existem.
 * Era esse o defeito da checagem que o `CreatePostCommand.Handler` fazia antes — um "user não existe"
 * confirmava a ausência para quem perguntasse.
 */
export class NotAnAuthorException extends Error {
  constructor(readonly userId?: UserId) {
    super(userId ? `user ${userId} não é autor: não escreve posts` : 'o autor informado não existe ou não pode escrever');
    this.name = 'NotAnAuthorException';
  }
}
