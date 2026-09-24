import { POSTS_SCHEMA, postgresDatabase } from '@nestposts/database';

export const mikroOrmConfig = (
  schema = process.env.POSTS_SCHEMA ?? POSTS_SCHEMA,
) => postgresDatabase(schema);
