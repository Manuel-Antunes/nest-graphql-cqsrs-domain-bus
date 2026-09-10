import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ValidatedDto } from '../../../validated-dto/mixins';

/**
 * Identidade do Post — o `@Embeddable record PostId(String value)` do Java, aqui gerado por
 * `ValidatedDto.Scalar` a partir do schema que carrega a invariante.
 *
 * A regra continua num schema Zod (`PostId.schema`), e o `parse` continua sendo o único jeito de
 * produzir um id válido a partir de texto de fora. O que a classe acrescenta é o resto do que um
 * value object é: `equals` por valor, `toString`/`toJSON` para atravessar protocolo e log, e um lugar
 * onde métodos que pertencem ao *id* podem morar.
 *
 * A coluna do banco não mudou: `varchar(36)` guardando o texto. Quem faz a travessia é o
 * `valueObjectType` no `PostSchema` — ver `infrastructure/persistence/sqlite/helpers/value-object-type`.
 */
export class PostId extends ValidatedDto.Scalar(z.uuid().brand<'PostId'>()) {
  /**
   * Um id novo. Construtor nomeado: `PostId.generate()` e `PostId.parse(...)` dizem no call site qual
   * dos dois casos é — inventar uma identidade, ou aceitar uma que veio de fora.
   */
  static generate(): PostId {
    return PostId.parse(randomUUID());
  }
}
