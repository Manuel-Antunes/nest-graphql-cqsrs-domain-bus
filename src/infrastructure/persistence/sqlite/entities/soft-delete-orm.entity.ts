import { defineEntity, p } from '@mikro-orm/core';
import { SoftDeletion } from '../../../../domain/shared/soft-delete';

/** O nome do filtro que esconde o que foi apagado — o `@SQLRestriction` da versão Java. */
export const ACTIVE_FILTER = 'active';

/**
 * O mapeamento do `@Embeddable` de soft delete.
 *
 * `prefix: false` mantém a coluna com o nome de sempre — `deleted_at`, na própria tabela do agregado —,
 * então trocar o campo solto pelo value object **não mudou o banco**.
 */
export const SoftDeletionSchema = defineEntity({
  class: SoftDeletion,
  embeddable: true,
  properties: {
    deletedAt: p.datetime().nullable(),
  },
});

/** A propriedade que embute o soft delete num `defineEntity` — o `@Embedded` do lado do mapeamento. */
export const softDeleteProperty = () => p.embedded(SoftDeletionSchema).prefix(false).object(false);

/**
 * O índice da coluna do soft delete, pronto para entrar no `indexes` de um `defineEntity`.
 *
 * O caminho é o da propriedade **embutida** (`deleted.deletedAt`) — é o que o schema generator sabe
 * resolver para a coluna. O cast existe porque o tipo de `properties` no `defineEntity` só enumera as
 * chaves de primeiro nível da entidade, e não os campos de dentro de um embeddable; `never` é
 * atribuível a qualquer uma delas, então o cast diz "confie no caminho" sem afrouxar mais nada.
 */
export const softDeleteIndex = { properties: ['deleted.deletedAt'] } as { properties: never };

/**
 * O filtro que esconde o que foi apagado: o `@SQLRestriction(ALIVE)` da versão Java, dito com a
 * ferramenta que o MikroORM oferece para isso — e que a documentação dele recomenda para soft delete.
 *
 * `default: true` faz toda consulta já nascer filtrada; quem precisar do apagado (restaurar, auditar)
 * pede explicitamente — `em.find(Post, {}, { filters: { active: false } })`.
 *
 * A contraparte do `@SQLDelete` que acompanha o `@SQLRestriction` lá é o `SoftDeleteSubscriber`:
 * filtro e subscriber são as duas peças que o MikroORM oferece para soft delete, e uma sem a outra
 * deixa um buraco — o filtro esconderia o que um `em.remove` teria apagado de verdade.
 */
export const activeFilter = {
  [ACTIVE_FILTER]: {
    name: ACTIVE_FILTER,
    cond: { deleted: { deletedAt: null } },
    default: true,
  },
};
