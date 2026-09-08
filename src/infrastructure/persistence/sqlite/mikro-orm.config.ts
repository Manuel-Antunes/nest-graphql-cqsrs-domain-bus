import { defineConfig } from '@mikro-orm/sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PostSchema } from '../../../domain/post/post.entity';
import { TagRefSchema } from '../../../domain/post/vo/tag-ref';
import { TagSchema } from '../../../domain/tag/tag.entity';

/**
 * Configuração do MikroORM para o SQLite. Uma função, e não um objeto, para que os testes peçam a
 * mesma configuração apontando para `:memory:`.
 *
 * - `entities`: os schemas do `defineEntity` (que já carregam as classes `Post` e `Tag`);
 * - `ensureDatabase.create`: cria as tabelas na subida quando o banco está vazio — é a POC, não há
 *   migrations;
 * - `allowGlobalContext` fica no padrão (`false`): qualquer uso do EntityManager global fora de um
 *   contexto explode na hora, em vez de compartilhar identity map entre requests sem querer.
 */
export const mikroOrmConfig = (dbName = process.env.POSTS_DB ?? 'data/posts.db') => {
  if (dbName !== ':memory:') {
    mkdirSync(dirname(dbName), { recursive: true });
  }
  return defineConfig({
    dbName,
    entities: [PostSchema, TagSchema, TagRefSchema],
    ensureDatabase: { create: true },
    debug: process.env.MIKRO_ORM_DEBUG === 'true',
  });
};
