import { registerAs } from '@nestjs/config';

import { Neo4jConfigEnvSchema } from './schema';

const neo4jConfig = registerAs('neo4j', () => {
  return Neo4jConfigEnvSchema.parse(process.env);
});

export default neo4jConfig;

export type Neo4jConfig = ReturnType<typeof neo4jConfig>;
