import { SoftDeleteSubscriber } from '@nestposts/platform/infrastructure/persistence/soft-delete/soft-delete.subscriber';
import { postsEntities } from '@nestposts/posts/infrastructure/posts-infrastructure.module';
import { transportEntities } from '@nestposts/transport-eventbus/persistence/message-inbox.entity';
import { OrganizationEntities } from '@nestposts/organizations/infrastructure/persistence/organization-entities';
import { usersEntities } from '@nestposts/users/infrastructure/users-infrastructure.module';
import { migratedDatabase, postsSchema } from './connection';
import { DatabaseSeeder } from './seeders/database.seeder';
import { DefaultTagSeeder } from './seeders/default-tag.seeder';

export default migratedDatabase({
  schema: postsSchema(),
  folder: 'posts',
  entities: [...postsEntities, ...usersEntities, ...OrganizationEntities.withAuth(), ...transportEntities],
  subscribers: [new SoftDeleteSubscriber()],
  seeders: [DatabaseSeeder, DefaultTagSeeder],
});
