import { DataloaderType } from '@mikro-orm/core';
import { defineConfig } from '@mikro-orm/sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PostSchema } from './entities/post-orm.entity';
import { SoftDeleteSubscriber } from './helpers/soft-delete.subscriber';
import { TagSchema } from './entities/tag-orm.entity';
import { AuthorSchema, ReaderSchema, UserSchema } from './entities/user-orm.entity';
import { betterAuthEntities } from '../../auth/auth';

/**
 * Configuração do MikroORM para o SQLite. Uma função, e não um objeto, para que os testes peçam a
 * mesma configuração apontando para `:memory:`.
 *
 * - `entities`: os schemas do `defineEntity` (que já carregam as classes `Post` e `Tag`);
 * - `ensureDatabase.create`: cria as tabelas na subida quando o banco está vazio — é a POC, não há
 *   migrations;
 * - `allowGlobalContext` fica no padrão (`false`): qualquer uso do EntityManager global fora de um
 *   contexto explode na hora, em vez de compartilhar identity map entre requests sem querer;
 * - **soft delete**: as duas peças que o MikroORM oferece para isso. O **filtro** `active` viaja no
 *   schema de cada agregado (`filters: activeFilter`, em `domain/shared/soft-delete`) e esconde o que
 *   foi apagado; o **subscriber** registrado aqui troca o `DELETE` por um `UPDATE deleted_at`, para
 *   que apagar pela porta do ORM não contrarie o filtro. Os dois defaults que fazem o resto —
 *   `filtersOnRelations` e `autoJoinRefsForFilters`, ambos `true` — não precisam ser ligados: o
 *   segundo é o que junta a relação m:1 filtrada e faz um autor apagado levar os posts dele junto,
 *   sem tocar em nenhuma linha de post;
 * - `dataloader: DataloaderType.ALL`: desde que `Post.tags` virou uma relação m:n, carregar as tags
 *   de N posts é N consultas se cada coleção for pedida por conta própria. O dataloader do MikroORM
 *   junta os `loadItems()` de uma mesma rodada do event loop numa consulta só. O caminho do GraphQL
 *   nem chega lá — o repositório popula as tags junto do post —, mas qualquer acesso preguiçoso que
 *   apareça já nasce agrupado.
 */
export const mikroOrmConfig = (dbName = process.env.POSTS_DB ?? 'data/posts.db') => {
  if (dbName !== ':memory:') {
    mkdirSync(dirname(dbName), { recursive: true });
  }
  return defineConfig({
    dbName,
    entities: [PostSchema, TagSchema, UserSchema, ReaderSchema, AuthorSchema, ...betterAuthEntities],
    subscribers: [new SoftDeleteSubscriber()],
    dataloader: DataloaderType.ALL,
    ensureDatabase: { create: true },
    debug: process.env.MIKRO_ORM_DEBUG === 'true',
  });
};
