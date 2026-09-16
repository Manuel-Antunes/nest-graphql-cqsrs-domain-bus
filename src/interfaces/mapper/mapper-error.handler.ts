import type { ErrorHandler } from "@automapper/core";
import { Logger } from "@nestjs/common";

/**
 * Para onde o AutoMapper fala — o padrão dele é `console.error`, que não passa pelo logger do Nest.
 *
 * `warn`, e não `error`, porque por aqui passam duas coisas diferentes: `Unmapped properties`, que é
 * perfil mal configurado; e falha ao traduzir um membro, que na maior parte das vezes é **entrada
 * malformada de cliente** — um id que não é UUID chega aqui. Gravar a segunda como `error` faria de
 * qualquer cliente uma torneira de log de erro, e afogaria a primeira.
 *
 * O que o cliente recebe não passa por aqui: quem decide é o `DomainExceptionFilter`.
 */
export class MapperErrorHandler implements ErrorHandler {
  private logger = new Logger("AutoMapper");

  handle(message: string): void {
    this.logger.warn(message);
  }
}
