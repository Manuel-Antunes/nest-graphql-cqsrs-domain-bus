import { AutoMap } from '@automapper/classes';
import type { DomainEvent } from '../../shared/domain-event';

/**
 * Evento de domínio: um Post passou a existir. Disparado por `Post.create(...)`.
 *
 * Carrega o estado inicial completo, então a subscription `onPostCreated` monta a view sem consultar
 * nada — direto do payload que passou pelo `EventBus`.
 *
 * O autor viaja como **id + nome**: o id é a identidade (o que liga o fato ao agregado `User`), o nome
 * é o retrato do momento (o que a view precisa exibir sem carregar o autor). É a mesma divisão das
 * tags — ver `PostUpdatedEventTag`.
 *
 * ## Por que os campos são declarados, e não parâmetros do construtor
 * Porque o `@AutoMap()` é um decorator de **propriedade**, e uma parameter property não é uma: o
 * TypeScript aceitaria a escrita, entregaria o decorator sem nome de campo, e a metadata sairia vazia
 * — calada.
 *
 * Tudo aqui é `string` e `Date`, e não value object, de propósito: um fato gravado precisa continuar
 * legível mesmo que a classe que o validava mude de ideia.
 */
export class PostCreatedEvent implements DomainEvent {
  @AutoMap()
  readonly postId: string;
  @AutoMap()
  readonly title: string;
  @AutoMap()
  readonly content: string;
  @AutoMap()
  readonly authorId: string;
  /** O retrato do momento. Nenhuma view o lê hoje — ver `Post.create`. */
  readonly authorName: string;
  @AutoMap()
  readonly occurredAt: Date;

  constructor(
    postId: string,
    title: string,
    content: string,
    authorId: string,
    authorName: string,
    occurredAt: Date,
  ) {
    this.postId = postId;
    this.title = title;
    this.content = content;
    this.authorId = authorId;
    this.authorName = authorName;
    this.occurredAt = occurredAt;
  }
}
