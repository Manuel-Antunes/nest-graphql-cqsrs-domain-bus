import { Migration } from '@mikro-orm/migrations';

export class Migration20260928140000_user_avatar extends Migration {

  override name = 'Migration20260928140000_user_avatar';

  override up(): void | Promise<void> {
    this.addSql(`alter table "users" alter column "image" type json using null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "users" alter column "image" type varchar(255) using null;`);
  }

}
