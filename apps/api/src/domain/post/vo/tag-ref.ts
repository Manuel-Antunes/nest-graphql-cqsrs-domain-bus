import { defineEntity, p } from '@mikro-orm/core';

/**
 * A referência que o Post guarda de uma Tag: o id e o nome dela, **copiados**.
 *
 * Por que uma cópia e não um `manyToMany(Tag)`: `Post` e `Tag` são agregados distintos. Agregado
 * referencia agregado **por identidade**, nunca por objeto — uma relação do ORM entre os dois criaria
 * uma fronteira transacional compartilhada, cascatas e lazy loading atravessando o limite de
 * consistência. O nome vem junto porque exibir um post não deveria obrigar a carregar o agregado Tag.
 *
 * É um *embeddable* do MikroORM guardado como array — no SQLite vira uma coluna JSON `tags` na própria
 * linha do post (o equivalente do `@ElementCollection` do JPA, sem a tabela auxiliar). Como o array
 * sempre vem junto da linha, ler N posts nunca dispara N consultas de tags: não há N+1 a evitar, e
 * por isso não há DataLoader nesta POC.
 *
 * Os campos são `string`, e não `TagId`/`TagName`: atravessar a fronteira de um agregado é como
 * atravessar a fronteira de um processo — o que passa é dado, não o tipo do outro lado.
 */
export const TagRefSchema = defineEntity({
  name: 'TagRef',
  embeddable: true,
  properties: {
    tagId: p.string(),
    name: p.string(),
  },
});

export interface TagRef {
  readonly tagId: string;
  readonly name: string;
}
