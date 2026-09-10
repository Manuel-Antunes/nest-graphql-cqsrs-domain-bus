import { z } from "zod";
import { ValidatedDto } from "../../validated-dto/mixins";
import { AlreadyDeletedException } from "./already-deleted.exception";
import { NotDeletedException } from "./not-deleted.exception";

/**
 * Marca no protótipo que uma entidade é apagável logicamente.
 *
 * É um símbolo, e não um `instanceof`, pelo mesmo motivo dos value objects escalares: cada aplicação
 * do mixin gera uma classe base diferente, e `Post` e `User` não têm ancestral comum. É por ele que o
 * {@link SoftDeleteSubscriber} reconhece quem ele deve marcar em vez de apagar.
 */
export const SOFT_DELETABLE = Symbol.for("domain:soft-deletable");

/** O que o subscriber precisa enxergar de uma entidade apagável. */
export interface SoftDeletableEntity {
  readonly [SOFT_DELETABLE]: true;
  isDeleted(): boolean;
  applyDeletion(at: Date): void;
  applyRestoration(): void;
}

/** `true` se a entidade herda do mixin {@link WithSoftDelete}. */
export function isSoftDeletable(
  entity: unknown,
): entity is SoftDeletableEntity {
  return (
    typeof entity === "object" &&
    entity !== null &&
    (entity as any)[SOFT_DELETABLE] === true
  );
}

/**
 * O estado de exclusão lógica: `null` = vivo, um instante = apagado naquele momento.
 *
 * É o `@Embeddable SoftDeletion` da versão Java, e existe pelo mesmo motivo: dar ao mixin **uma**
 * propriedade para pedir, em vez de um `deletedAt` solto em cada entidade.
 *
 * ## Mutável, ao contrário dos outros value objects
 * É a mesma escolha da versão Java, e a exceção é deliberada: este é o pedaço de estado que o ORM
 * gerencia e que as transições do mixin alteram. O mesmo motivo por que as entidades têm campos
 * não-finais vale aqui.
 *
 * Quem escreve `deletedAt` é o mixin, e só ele — mas isso é **disciplina, não garantia**. Em Java a
 * mutação fica trancada por visibilidade de pacote; TypeScript não tem equivalente, então o que
 * existe é a convenção de que ninguém mexe no holder por fora de `applyDeletion`/`applyRestoration`.
 *
 * ## Timestamp em vez de boolean
 * Um `boolean` responde "está apagado?"; o instante responde também "desde quando", que é a pergunta
 * que aparece assim que alguém precisa auditar ou expirar apagados. Custa a mesma coluna.
 */
export class SoftDeletion extends ValidatedDto(
  z.object({ deletedAt: z.date().nullable().default(null) }),
) {
  /** O estado em que tudo nasce: vivo. */
  static alive(): SoftDeletion {
    return new SoftDeletion({ deletedAt: null });
  }

  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  /** O instante, ou `null` quando vivo. O `at()` da versão Java. */
  at(): Date | null {
    return this.deletedAt;
  }

  override toString(): string {
    return this.isDeleted
      ? `apagado em ${this.deletedAt?.toISOString()}`
      : "vivo";
  }
}

/**
 * **Mixin** de exclusão lógica: quem herda ganha o estado, as perguntas e as transições prontas, e só
 * precisa dizer *como se identifica*.
 *
 * É o `interface SoftDeletable` com métodos default da versão Java, na forma que um mixin toma em
 * TypeScript — uma classe. A diferença de forma não muda o contrato: o mixin pede o mínimo e entrega
 * o comportamento.
 *
 * ## O contrato, em duas metades
 * - **o que você implementa**: `identity()` — como esta entidade aparece numa mensagem de erro;
 * - **o que você ganha**: o estado (`deleted`), as perguntas (`isDeleted`, `deletedAt`) e os dois
 *   pares de transição abaixo.
 *
 * ## Decidir e evoluir, como no resto do projeto
 * `softDelete`/`restore` **decidem**: recusam quando não há fato novo. São também o ponto de
 * extensão — um agregado que registra o fato sobrescreve e chama `super` antes de disparar o evento.
 * `applyDeletion`/`applyRestoration` **evoluem**: aplicam um fato que já aconteceu, sem verificar nada.
 *
 * A distinção não é estética. O mesmo `PostDeletedEvent` é aplicado **duas vezes** — o agregado aplica
 * ao decidir, para devolver a entidade pronta para salvar, e o replay aplica de novo ao reconstituir.
 * Um handler `on<Evento>` que chamasse a versão que decide estouraria na segunda.
 *
 * (Em Java os dois pares se chamam `delete`/`restore` e `applyDeletion`/`applyRestoration`, e o
 * agregado *sobrecarrega* o primeiro par para acrescentar o evento. Aqui ele **sobrescreve** e chama
 * `super` — é a mesma relação, dita com a ferramenta que o TypeScript tem.)
 *
 * ## Por que isto não é herança comum
 * `Post` e `User` não têm nem poderiam ter um ancestral comum de domínio — um é agregado com stream
 * próprio, o outro é a raiz de uma herança multi-tabela. "Ser apagável" é ortogonal a "ser post" e a
 * "ser usuário", e um mixin atravessa as duas hierarquias sem tocar nelas.
 *
 * ## A parte que o mixin não resolve, e não deveria
 * Os dois pares mudam o objeto **em memória**. Esconder das consultas o que foi marcado, e fazer uma
 * linha escondida voltar a aparecer, é do adapter de persistência — ver o `soft-delete-orm.entity` e
 * o `SoftDeleteSubscriber`, em `infrastructure/persistence/sqlite/entities` e `/helpers`.
 */
export function WithSoftDelete<
  TBase extends abstract new (...args: any[]) => object,
>(Base: TBase) {
  abstract class SoftDeletable extends Base {
    /** O value object embutido. Nasce vivo — e é o ORM quem o substitui ao hidratar. */
    deleted: SoftDeletion = SoftDeletion.alive();

    /** Está apagada? A pergunta vai ao value object; o agregado só a repassa. */
    isDeleted(): boolean {
      return this.deleted.isDeleted;
    }

    /** `null` enquanto viva. */
    get deletedAt(): Date | null {
      return this.deleted.at();
    }

    // ---- decidir: recusa quando não há fato novo -------------------------------------------------

    /**
     * **Decide** a exclusão: recusa se não houver fato novo, e só então muda o estado.
     *
     * É o ponto de extensão do mixin. Um agregado que precisa *registrar* o fato sobrescreve e chama
     * `super` primeiro — a guarda roda antes de existir evento, que é a ordem certa:
     *
     * ```ts
     * override softDelete(now: Date): this {
     *   super.softDelete(now);
     *   this.apply(new PostDeletedEvent(this.id.value, this.version + 1, now));
     *   return this;
     * }
     * ```
     *
     * @throws AlreadyDeletedException se já estiver apagada
     */
    softDelete(now: Date): void {
      if (this.isDeleted()) {
        throw new AlreadyDeletedException(this);
      }
      this.applyDeletion(now);
    }

    /**
     * **Decide** a restauração. A contraparte de {@link softDelete}, e o mesmo ponto de override.
     *
     * O `now` não é usado aqui — restaurar é apagar o instante, não gravar outro. Ele está na
     * assinatura porque quem sobrescreve *precisa* dele para o evento, e porque é o que deixa a
     * sobrescrita chamar `super` sem torcer a assinatura.
     *
     * @throws NotDeletedException se não estiver apagada
     */
    restore(_now: Date): void {
      if (!this.isDeleted()) {
        throw new NotDeletedException(this);
      }
      this.applyRestoration();
    }

    // ---- evoluir: aplica um fato que já aconteceu, sem verificar ---------------------------------

    /** Aplica a exclusão **sem verificar** nada. Idempotente: o instante vem do evento. */
    applyDeletion(at: Date): void {
      this.deleted.deletedAt = at;
    }

    /** A contraparte de {@link applyDeletion}, pelo mesmo motivo. */
    applyRestoration(): void {
      this.deleted.deletedAt = null;
    }
  }

  // O marcador vai no protótipo: toda instância o tem, nenhuma o serializa.
  Object.defineProperty(SoftDeletable.prototype, SOFT_DELETABLE, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  });

  return SoftDeletable;
}
