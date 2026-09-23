import type { EntityManager } from '@mikro-orm/postgresql';
import { Seeder } from '@mikro-orm/seeder';

import { DefaultTagSeeder } from './default-tag.seeder';
import { TestUsersSeeder } from './test-users.seeder';

export class DatabaseSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    return this.call(em, [DefaultTagSeeder, TestUsersSeeder]);
  }
}
