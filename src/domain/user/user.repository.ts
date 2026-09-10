import type { Email } from './vo/email';
import type { User } from './user.entity';
import type { UserId } from './vo/user-id';

/**
 * Porta do repositório de Users. Como `PostRepository`, é `abstract class` — contrato e token de
 * injeção na mesma peça.
 *
 * `findActiveByEmail` é a consulta que sustenta a ligação de contas e a promoção: ela procura entre os
 * **ativos** (nem encerrados, nem apagados), que é exatamente o conjunto sobre o qual o email é único.
 * `findSupersededBy` é o outro lado — dado um sucessor, quem foi encerrado por ele —, e é o que deixa
 * o `UserProvisioning` detectar uma promoção interrompida no meio.
 */
export abstract class UserRepository {
  abstract save(user: User): Promise<void>;

  /**
   * Grava vários users **numa transação só**.
   *
   * Existe para a promoção, que é a única operação do sistema a escrever duas linhas que apontam uma
   * para a outra. Desde que `supersededBy`/`supersedes` viraram relacionamentos, dois `save`
   * separados não servem: o primeiro flush gravaria uma referência para uma linha que ainda não
   * existe, e a chave estrangeira recusa — com razão. Num flush só, o unit of work ordena o insert
   * antes do update, e não há instante em que o banco esteja inconsistente nem estado intermediário
   * para um processo interrompido deixar para trás.
   */
  abstract saveAll(users: readonly User[]): Promise<void>;
  abstract findById(userId: UserId): Promise<User | null>;
  /** Ativos apenas: quem foi encerrado por uma promoção ou apagado não responde por este email. */
  abstract findActiveByEmail(email: Email): Promise<User | null>;
  /** O stream que foi encerrado em favor deste — `null` se não houve promoção. */
  abstract findSupersededBy(userId: UserId): Promise<User | null>;

  /**
   * O stream **encerrado** mais recente com este email — a marca de uma promoção que morreu no meio.
   *
   * É o complemento de `findActiveByEmail`: aquela procura entre os ativos, esta procura justamente
   * entre os que deixaram de ser. Existe para o `UserProvisioning` conseguir retomar o id que já
   * estava anotado no `supersededBy`, em vez de duplicar a pessoa na tentativa seguinte.
   */
  abstract findSupersededByEmail(email: Email): Promise<User | null>;

  /** Torna a linha de um usuário apagado visível de novo — ver `PostRepository.restore`. */
  abstract restore(userId: UserId): Promise<void>;
}
