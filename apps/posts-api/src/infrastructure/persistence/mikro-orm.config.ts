import { SeedManager } from '@mikro-orm/seeder';
import { DataloaderType, POSTS_SCHEMA, postgresDatabase } from '@nestposts/database';
import { SoftDeleteSubscriber } from '@nestposts/platform/infrastructure/persistence/soft-delete/soft-delete.subscriber';

/**
 * The connection, and nothing about who uses it: every table reaches the ORM through the module that
 * owns it — `DatabaseModule.forFeature`, in `PostsInfrastructureModule`, `UsersInfrastructureModule`,
 * `IdentityModule` and the transport's own module. The schema itself is `apps/migrator`'s: what this
 * says is only WHERE it lives, and `POSTS_SCHEMA` is what a suite overrides to get one of its own.
 */
export const mikroOrmConfig = (schema = process.env.POSTS_SCHEMA ?? POSTS_SCHEMA) =>
  postgresDatabase(schema, {
    subscribers: [new SoftDeleteSubscriber()],
    dataloader: DataloaderType.ALL,
    extensions: [SeedManager],
  });
