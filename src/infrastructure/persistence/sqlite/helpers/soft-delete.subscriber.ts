import type { EventSubscriber, FlushEventArgs } from '@mikro-orm/core';
import { ChangeSetType } from '@mikro-orm/core';
import { isSoftDeletable } from '../../../../domain/shared/soft-delete';

/**
 * A outra metade da receita de soft delete do MikroORM: o **subscriber** que troca um `DELETE` por um
 * `UPDATE deleted_at`.
 *
 * O filtro `active` esconde; este aqui é o que impede a linha de sumir de verdade. Juntos são o par
 * `@SQLRestriction` + `@SQLDelete` da versão Java — com a diferença de que lá as duas anotações vão em
 * cada entidade, e aqui o filtro viaja no schema e o subscriber vale para **qualquer** entidade que
 * herde o mixin, reconhecida pelo marcador `SOFT_DELETABLE`.
 *
 * ## Onde ele entra
 * `onFlush` roda depois de a unidade de trabalho calcular os changesets e antes de o SQL sair: é a
 * janela em que dá para reclassificar um `DELETE` como `UPDATE`. O `recomputeSingleChangeSet` refaz o
 * payload com o `deleted_at` que acabou de ser marcado.
 *
 * ## Herança multi-tabela
 * É o caso que a versão Java precisou cobrir com um `@SQLDelete` extra no `Author`: numa herança
 * `JOINED`, o Hibernate emite **um DELETE por tabela**, e sem aquilo a linha de `authors` sumiria de
 * verdade enquanto a de `users` só era marcada — o autor voltaria de um restore como se fosse leitor.
 * Aqui o changeset da entidade concreta carrega os das tabelas-pai (`tptChangeSets`), e reclassificar
 * o de cima reclassifica a operação inteira: nenhuma tabela da hierarquia recebe `DELETE`.
 *
 * ## O que ele *não* faz
 * Não dispara evento de domínio. Apagar pela porta do ORM é o caminho de infraestrutura — o caminho do
 * domínio é `post.softDelete(now)`, que decide, recusa o que não tem fato novo e registra o evento.
 * Este subscriber existe para que o caminho de infraestrutura não contrarie o filtro.
 */
export class SoftDeleteSubscriber implements EventSubscriber {
  onFlush(args: FlushEventArgs): void {
    for (const changeSet of args.uow.getChangeSets()) {
      const isDelete =
        changeSet.type === ChangeSetType.DELETE || changeSet.type === ChangeSetType.DELETE_EARLY;
      if (!isDelete || !isSoftDeletable(changeSet.entity)) {
        continue;
      }

      if (!changeSet.entity.isDeleted()) {
        changeSet.entity.applyDeletion(new Date());
      }
      changeSet.type =
        changeSet.type === ChangeSetType.DELETE_EARLY
          ? ChangeSetType.UPDATE_EARLY
          : ChangeSetType.UPDATE;
      args.uow.recomputeSingleChangeSet(changeSet.entity);
    }
  }
}
