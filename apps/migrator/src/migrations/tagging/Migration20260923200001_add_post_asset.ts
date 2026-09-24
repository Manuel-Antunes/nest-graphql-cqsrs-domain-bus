import { Migration } from '@mikro-orm/migrations';

export class Migration20260923200001_add_post_asset extends Migration {
  override name = 'Migration20260923200001_add_post_asset';

  override up(): void | Promise<void> {
    this.addSql(`alter table "tagging"."posts" add column "asset" json null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "tagging"."posts" drop column "asset";`);
  }
}
